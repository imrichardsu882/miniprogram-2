// miniprogram/pages/create/create.js (最终·数据形态修复版)
const db = wx.cloud.database();
const homeworksCollection = db.collection('homeworks');
const app = getApp();

Page({
  data: {
    isEditMode: false,
    homeworkId: null,
    homeworkTitle: '',
    wordsToParse: '',
    isParsing: false,
    wordListForHomework: [],
    
    isEditingWord: false,
    editingWordIndex: -1,
    editingWordData: { word: '', phonetics: '', meaningsStr: '' },
    
    // 自动保存相关状态
    autoSaveEnabled: true,
    autoSaveStatus: '', // 'saving', 'saved', 'failed', ''
    lastSaveTime: null,
    hasUnsavedChanges: false,
  },

  // 自动保存定时器
  autoSaveTimer: null,
  autoSaveDelay: 2000, // 2秒防抖延迟

  onLoad: function (options) {
    if (options.id) {
      this.setData({ isEditMode: true, homeworkId: options.id });
      wx.setNavigationBarTitle({ title: '编辑作业' });
      this.loadHomeworkForEdit(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '创建新作业' });
    }
  },

  onUnload: function() {
    // 页面卸载时清除定时器
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.saveHintTimer) {
      clearTimeout(this.saveHintTimer);
      this.saveHintTimer = null;
    }
  },

  onHide: function() {
    // 页面隐藏时，如果有未保存的更改且开启了自动保存，立即保存
    if (this.data.autoSaveEnabled && this.data.hasUnsavedChanges) {
      this.performAutoSave();
    }
  },

  async loadHomeworkForEdit(id) {
    wx.showLoading({ title: '正在加载...' });
    try {
      const res = await homeworksCollection.doc(id).get();
      // ★★★ 核心修正：为从云端加载的单词补充页面所需的 style 属性 ★★★
      const wordsWithStyle = res.data.words.map(word => {
        return { ...word, style: '' };
      });

      this.setData({
        homeworkTitle: res.data.name,
        wordListForHomework: wordsWithStyle // 使用处理过的数据
      });
    } catch (err) {
      console.error("加载待编辑作业失败", err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onSaveHomework() {
    const title = this.data.homeworkTitle.trim();
    if (!title) { return wx.showToast({ title: '请输入作业标题', icon: 'none' }); }
    if (this.data.wordListForHomework.length === 0) { return wx.showToast({ title: '请添加单词', icon: 'none' }); }

    wx.showLoading({ title: '正在保存...' });
    
    // 保存到数据库前，移除临时的 style 属性，保持数据纯净
    const wordsToSave = this.data.wordListForHomework.map(({ style, ...rest }) => rest);

    const homeworkData = {
      name: title,
      words: wordsToSave,
      creatorOpenId: app.globalData.userInfo._openid,
      createTime: db.serverDate()
    };

    try {
      if (this.data.isEditMode) {
        await homeworksCollection.doc(this.data.homeworkId).update({
          data: {
            name: homeworkData.name,
            words: homeworkData.words
          }
        });
      } else {
        const addRes = await homeworksCollection.add({ data: homeworkData });
        // addRes._id 可用于后续高亮新建项（如有需要）
      }
      // 无论新增还是更新，通知上一页刷新列表，避免返回时看不到最新数据
      this._notifyPrevPageRefresh();
      
      // 更新保存状态
      this.setData({ 
        hasUnsavedChanges: false,
        lastSaveTime: new Date().toLocaleTimeString()
      });
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 通知上一页（通常是 `pages/teacher/teacher`）刷新数据
  _notifyPrevPageRefresh() {
    try {
      const pages = getCurrentPages();
      if (pages && pages.length >= 2) {
        const prevPage = pages[pages.length - 2];
        if (prevPage && typeof prevPage.refreshHomeworkList === 'function') {
          prevPage.refreshHomeworkList();
        }
      }
    } catch (e) {
      // 忽略跨页调用异常，仍然依赖返回页 onShow 的自动刷新
    }
  },

  // 触发自动保存（防抖）
  triggerAutoSave() {
    if (!this.data.autoSaveEnabled) {
      return;
    }

    // 清除之前的定时器
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // 设置新的定时器
    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave();
    }, this.autoSaveDelay);
  },

  // 执行自动保存
  async performAutoSave() {
    if (!this.data.autoSaveEnabled || !this.data.hasUnsavedChanges) {
      return;
    }

    const title = this.data.homeworkTitle.trim();
    if (!title || this.data.wordListForHomework.length === 0) {
      return; // 数据不完整，不进行自动保存
    }

    // 检查网络状态
    const networkType = await this.checkNetworkStatus();
    if (!networkType || networkType === 'none') {
      this.setData({ autoSaveStatus: 'failed' });
      setTimeout(() => {
        this.setData({ autoSaveStatus: '' });
      }, 3000);
      return;
    }

    this.setData({ autoSaveStatus: 'saving' });

    try {
      // 保存到数据库前，移除临时的 style 属性
      const wordsToSave = this.data.wordListForHomework.map(({ style, ...rest }) => rest);

      const homeworkData = {
        name: title,
        words: wordsToSave,
        creatorOpenId: app.globalData.userInfo._openid,
        createTime: db.serverDate()
      };

      if (this.data.isEditMode && this.data.homeworkId) {
        // 编辑模式：更新现有作业
        await homeworksCollection.doc(this.data.homeworkId).update({
          data: {
            name: title,
            words: wordsToSave
          }
        });
      } else {
        // 新建模式：创建新作业并切换到编辑模式
        const addRes = await homeworksCollection.add({ data: homeworkData });
        this.setData({ 
          isEditMode: true, 
          homeworkId: addRes._id 
        });
        wx.setNavigationBarTitle({ title: '编辑作业' });
      }

      this.setData({ 
        autoSaveStatus: 'saved',
        hasUnsavedChanges: false,
        lastSaveTime: new Date().toLocaleTimeString()
      });

      // 3秒后清除保存状态提示
      setTimeout(() => {
        this.setData({ autoSaveStatus: '' });
      }, 3000);

    } catch (err) {
      console.error('自动保存失败:', err);
      this.setData({ autoSaveStatus: 'failed' });
      
      // 如果是网络错误，稍后重试
      if (this.isNetworkError(err)) {
        setTimeout(() => {
          if (this.data.hasUnsavedChanges && this.data.autoSaveEnabled) {
            this.triggerAutoSave();
          }
        }, 10000); // 10秒后重试
      }
      
      // 5秒后清除失败状态
      setTimeout(() => {
        this.setData({ autoSaveStatus: '' });
      }, 5000);
    }
  },

  // 检查网络状态
  checkNetworkStatus() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          resolve(res.networkType);
        },
        fail: () => {
          resolve(null);
        }
      });
    });
  },

  // 判断是否为网络错误
  isNetworkError(error) {
    if (!error) return false;
    const errorMsg = error.message || error.errMsg || '';
    return errorMsg.includes('network') || 
           errorMsg.includes('timeout') || 
           errorMsg.includes('连接') ||
           errorMsg.includes('网络');
  },

  // 智能保存提示
  showSaveHint() {
    // 如果自动保存已开启，不显示提示
    if (this.data.autoSaveEnabled) return;
    
    // 如果单词数量较多且有未保存更改，显示友好提示
    if (this.data.wordListForHomework.length >= 10 && this.data.hasUnsavedChanges) {
      // 防止频繁提示，使用节流
      if (this.saveHintTimer) {
        clearTimeout(this.saveHintTimer);
      }
      
      this.saveHintTimer = setTimeout(() => {
        if (this.data.hasUnsavedChanges && !this.data.autoSaveEnabled) {
          wx.showToast({
            title: '建议开启自动保存',
            icon: 'none',
            duration: 2000
          });
        }
      }, 5000); // 5秒后提示
    }
  },

  // 切换自动保存开关
  toggleAutoSave(e) {
    const newState = e.detail.value;
    this.setData({ autoSaveEnabled: newState });
    
    if (newState) {
      wx.showToast({ title: '已开启自动保存', icon: 'success' });
      // 如果有未保存的更改，立即触发自动保存
      if (this.data.hasUnsavedChanges) {
        this.triggerAutoSave();
      }
    } else {
      wx.showToast({ title: '已关闭自动保存', icon: 'none' });
      // 清除定时器
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
    }
  },

  onTitleInput: function(e) { 
    this.setData({ 
      homeworkTitle: e.detail.value,
      hasUnsavedChanges: true 
    }); 
    this.triggerAutoSave();
    this.showSaveHint();
  },

  editWord: function(e) {
    const index = e.currentTarget.dataset.index;
    const wordData = this.data.wordListForHomework[index];
    const meaningsStr = wordData.meanings.map(m => `${m.pos} ${m.def}`).join('\n');
    
    // 为每个释义添加选中状态，默认全部选中
    const meaningsWithSelection = wordData.meanings.map(m => ({
      ...m,
      selected: true
    }));
    
    this.setData({
      isEditingWord: true,
      editingWordIndex: index,
      editingWordData: { 
        word: wordData.word, 
        phonetics: wordData.phonetics, 
        meaningsStr: meaningsStr,
        meanings: meaningsWithSelection,
        manualEditMode: false
      }
    });
  },

  closeEditModal: function() { this.setData({ isEditingWord: false }); },
  preventModalClose: function() {},
  onEditInput: function(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`editingWordData.${field}`]: e.detail.value });
  },

  // 切换释义的选中状态
  toggleMeaning: function(e) {
    const index = e.currentTarget.dataset.index;
    const meanings = [...this.data.editingWordData.meanings];
    meanings[index].selected = !meanings[index].selected;
    
    this.setData({
      [`editingWordData.meanings`]: meanings
    });
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
  },

  // 切换编辑模式
  toggleEditMode: function() {
    const currentMode = this.data.editingWordData.manualEditMode;
    
    if (!currentMode) {
      // 切换到手动编辑模式，同步当前选中的释义到文本框
      const selectedMeanings = this.data.editingWordData.meanings
        .filter(m => m.selected)
        .map(m => `${m.pos} ${m.def}`)
        .join('\n');
      
      this.setData({
        [`editingWordData.manualEditMode`]: true,
        [`editingWordData.meaningsStr`]: selectedMeanings
      });
    } else {
      // 切换回标签模式，解析文本框内容
      const meaningsStr = this.data.editingWordData.meaningsStr;
      const parsedMeanings = meaningsStr.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.trim().match(/^([a-z]+\.)\s*(.*)$/);
        return { 
          pos: parts ? parts[1] : 'n.', 
          def: parts ? parts[2] : line.trim(),
          selected: true
        };
      });
      
      this.setData({
        [`editingWordData.manualEditMode`]: false,
        [`editingWordData.meanings`]: parsedMeanings
      });
    }
  },

  saveWordEdit: function() {
    const index = this.data.editingWordIndex;
    const { phonetics, manualEditMode, meanings, meaningsStr } = this.data.editingWordData;
    
    let newMeanings;
    
    if (manualEditMode) {
      // 手动编辑模式：解析文本框内容
      newMeanings = meaningsStr.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.trim().match(/^([a-z]+\.)\s*(.*)$/);
        return { pos: parts ? parts[1] : 'n.', def: parts ? parts[2] : line.trim() };
      });
    } else {
      // 标签模式：只保留选中的释义
      newMeanings = meanings.filter(m => m.selected).map(m => ({
        pos: m.pos,
        def: m.def
      }));
    }

    // 确保至少有一个释义
    if (newMeanings.length === 0) {
      wx.showToast({ title: '请至少保留一个释义', icon: 'none' });
      return;
    }

    this.setData({
      [`wordListForHomework[${index}].phonetics`]: phonetics,
      [`wordListForHomework[${index}].meanings`]: newMeanings,
      isEditingWord: false,
      hasUnsavedChanges: true
    });
    this.triggerAutoSave();
    
    // 成功提示
    wx.showToast({ 
      title: `已保留 ${newMeanings.length} 个释义`, 
      icon: 'success',
      duration: 1500
    });
  },

  onSwitchChange: function(e) {},
  parseAndAddWords: function () {
    const text = this.data.wordsToParse.trim();
    if (!text) return this.handleError('请输入或粘贴单词');
    
    // ★★★ 核心修复：智能短语解析 ★★★
    const parsedWords = this.parseWordsAndPhrases(text);
    console.log('解析结果:', parsedWords);
    
    const existingWords = new Set(this.data.wordListForHomework.map(item => item.word));
    const newWords = parsedWords.filter(word => !existingWords.has(word));
    if (newWords.length === 0) return this.handleError('没有新的单词需要添加');
    
    this.setData({ isParsing: true });
    wx.showLoading({ title: `正在解析 ${newWords.length} 个词条...`, mask: true });
    const promises = newWords.map(word => this.fetchSingleWord(word));
    Promise.all(promises).then(results => {
      this.setData({ isParsing: false });
      wx.hideLoading();
      const successfulWords = results.filter(Boolean);
      const failedCount = newWords.length - successfulWords.length;
      if (successfulWords.length > 0) {
        this.setData({
          wordListForHomework: [...successfulWords, ...this.data.wordListForHomework],
          wordsToParse: '',
          hasUnsavedChanges: true
        });
        this.triggerAutoSave();
      }
      if (failedCount > 0) wx.showToast({ title: `${failedCount} 个词未找到`, icon: 'none' });
      else if (successfulWords.length > 0) wx.showToast({ title: '添加成功', icon: 'success' });
    });
  },

  // ★★★ 修复：智能短语解析方法 ★★★
  parseWordsAndPhrases: function(text) {
    const words = [];
    let currentWord = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // 检测引号开始（支持中英文引号）
      if ((char === '"' || char === '"' || char === '"' || char === "'") && !inQuotes) {
        // 保存引号前的单词
        if (currentWord.trim()) {
          words.push(currentWord.trim());
          currentWord = '';
        }
        // 开始引用模式
        inQuotes = true;
      } 
      // 检测引号结束（支持中英文引号）
      else if ((char === '"' || char === '"' || char === '"' || char === "'") && inQuotes) {
        // 保存引号内的短语（不包含引号本身）
        if (currentWord.trim()) {
          words.push(currentWord.trim());
          currentWord = '';
        }
        // 结束引用模式
        inQuotes = false;
      } 
      // 在引号内，保留所有字符包括空格
      else if (inQuotes) {
        currentWord += char;
      } 
      // 在引号外，遇到分隔符
      else if (/[,，\n\t\r|；;\s]/.test(char)) {
        if (currentWord.trim()) {
          words.push(currentWord.trim());
          currentWord = '';
        }
      } 
      // 普通字符
      else {
        currentWord += char;
      }
    }
    
    // 处理最后一个词
    if (currentWord.trim()) {
      words.push(currentWord.trim());
    }
    
    // 去重并过滤空值
    const result = [...new Set(words.filter(word => word && word.length > 0))];
    console.log('解析输入:', text);
    console.log('解析结果:', result);
    return result;
  },
  removeWord: function (e) {
    const wordToRemove = e.currentTarget.dataset.word;
    const newList = this.data.wordListForHomework.filter(item => item.word !== wordToRemove);
    this.setData({ 
      wordListForHomework: newList,
      hasUnsavedChanges: true 
    });
    this.triggerAutoSave();
    wx.vibrateShort({ type: 'light' });
  },
  onTypeChange: function(e) {
    const index = e.currentTarget.dataset.index;
    const type = e.detail.value ? 'sp' : 'mc';
    this.setData({ 
      [`wordListForHomework[${index}].type`]: type,
      hasUnsavedChanges: true 
    });
    this.triggerAutoSave();
  },
  fetchSingleWord: function (word) {
    return new Promise(resolve => {
      wx.request({
        url: `https://dict.youdao.com/jsonapi?q=${word}`,
        success: res => resolve(this.parseYoudaoData(res.data, word)),
        fail: () => resolve(null)
      });
    });
  },
  parseYoudaoData: function (data, originalWord) {
    try {
      const wordData = data && data.ec && data.ec.word && data.ec.word[0];
      
      // 检查是否为短语（包含空格）- 使用兼容性更好的方法
      const isPhrase = originalWord.indexOf(' ') !== -1;
      
      if (!wordData) {
        // 如果API没有返回数据，但是是短语，创建一个基础条目
        if (isPhrase) {
          return {
            id: Date.now() + Math.random(),
            word: originalWord,
            phonetics: '[短语]', // 短语标识
            meanings: [{ pos: 'phrase', def: '请手动添加释义' }],
            type: 'mc',
            style: ''
          };
        }
        return null;
      }
      
      const meanings = wordData.trs && wordData.trs.map(tr => {
        const translation = tr.tr && tr.tr[0] && tr.tr[0].l && tr.tr[0].l.i && tr.tr[0].l.i[0];
        if (!translation) return null;
        const parts = translation.match(/^([a-z]+\.)\s*(.*)$/);
        return { pos: (parts && parts[1]) || (isPhrase ? 'phrase' : 'n.'), def: (parts && parts[2]) || translation };
      }).filter(Boolean);
      
      if (meanings && meanings.length > 0) {
        return {
          id: Date.now() + Math.random(),
          word: originalWord,
          phonetics: isPhrase ? '[短语]' : `[${wordData.ukphone || wordData.usphone || ''}]`,
          meanings: meanings,
          type: 'mc',
          style: ''
        };
      }
      
      // 如果没有找到释义但是是短语，提供默认条目
      if (isPhrase) {
        return {
          id: Date.now() + Math.random(),
          word: originalWord,
          phonetics: '[短语]',
          meanings: [{ pos: 'phrase', def: '请手动添加释义' }],
          type: 'mc',
          style: ''
        };
      }
      
      return null;
    } catch (e) { 
      // 出错时，如果是短语，仍然创建基础条目
      if (originalWord.indexOf(' ') !== -1) {
        return {
          id: Date.now() + Math.random(),
          word: originalWord,
          phonetics: '[短语]',
          meanings: [{ pos: 'phrase', def: '请手动添加释义' }],
          type: 'mc',
          style: ''
        };
      }
      return null; 
    }
  },
  handleError: function(title) {
    wx.showToast({ title: title, icon: 'none' });
  }
});