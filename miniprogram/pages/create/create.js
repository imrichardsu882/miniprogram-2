// miniprogram/pages/create/create.js (最终·自动保存版)
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
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ isEditMode: true, homeworkId: options.id });
      wx.setNavigationBarTitle({ title: '编辑作业' });
      this.loadHomeworkForEdit(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '创建新作业' });
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
      createTime: new Date()
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
        const addResult = await homeworksCollection.add({ data: homeworkData });
        // 如果是新建模式，保存成功后更新页面状态为编辑模式
        if (addResult._id) {
          this.setData({ 
            isEditMode: true, 
            homeworkId: addResult._id 
          });
        }
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onTitleInput: function(e) { 
    this.setData({ homeworkTitle: e.detail.value }, () => {
      // ★★★ 新增：作业标题改动时自动保存 ★★★
      this.autoSaveAfterTitleChange();
    }); 
  },

  // ★★★ 新增：作业标题改动后自动保存的方法 ★★★
  async autoSaveAfterTitleChange() {
    const title = this.data.homeworkTitle.trim();
    if (!title) { 
      return;
    }
    if (this.data.wordListForHomework.length === 0) { 
      return;
    }

    // 防抖处理：避免频繁保存
    if (this.titleSaveTimer) {
      clearTimeout(this.titleSaveTimer);
    }
    
    this.titleSaveTimer = setTimeout(async () => {
      // 保存到数据库前，移除临时的 style 属性，保持数据纯净
      const wordsToSave = this.data.wordListForHomework.map(({ style, ...rest }) => rest);

      const homeworkData = {
        name: title,
        words: wordsToSave,
        creatorOpenId: app.globalData.userInfo._openid,
        createTime: new Date()
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
          const addResult = await homeworksCollection.add({ data: homeworkData });
          // 如果是新建模式，保存成功后更新页面状态为编辑模式
          if (addResult._id) {
            this.setData({ 
              isEditMode: true, 
              homeworkId: addResult._id 
            });
          }
        }
        console.log('标题改动后自动保存成功');
      } catch (err) {
        console.error('标题改动后自动保存失败:', err);
        wx.showToast({ title: '自动保存失败', icon: 'none' });
      }
    }, 1000); // 1秒防抖
  },

  editWord: function(e) {
    const index = e.currentTarget.dataset.index;
    const wordData = this.data.wordListForHomework[index];
    const meaningsStr = wordData.meanings.map(m => `${m.pos} ${m.def}`).join('\n');
    
    this.setData({
      isEditingWord: true,
      editingWordIndex: index,
      editingWordData: { word: wordData.word, phonetics: wordData.phonetics, meaningsStr: meaningsStr }
    });
  },

  closeEditModal: function() { this.setData({ isEditingWord: false }); },
  preventModalClose: function() {},
  onEditInput: function(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`editingWordData.${field}`]: e.detail.value });
  },

  saveWordEdit: function() {
    const index = this.data.editingWordIndex;
    const { phonetics, meaningsStr } = this.data.editingWordData;
    const newMeanings = meaningsStr.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.trim().match(/^([a-z]+\.)\s*(.*)$/);
      return { pos: parts ? parts[1] : 'n.', def: parts ? parts[2] : line.trim() };
    });

    this.setData({
      [`wordListForHomework[${index}].phonetics`]: phonetics,
      [`wordListForHomework[${index}].meanings`]: newMeanings,
      isEditingWord: false
    }, () => {
      // ★★★ 新增：编辑单词后自动保存 ★★★
      this.autoSaveAfterEdit();
    });
  },

  onSwitchChange: function(e) {},
  parseAndAddWords: function () {
    const text = this.data.wordsToParse.trim();
    if (!text) return this.handleError('请输入或粘贴单词');
    const rawWords = text.replace(/[,，\n\t]/g, ' ').split(' ');
    const uniqueWords = [...new Set(rawWords.filter(word => word))];
    const existingWords = new Set(this.data.wordListForHomework.map(item => item.word));
    const newWords = uniqueWords.filter(word => !existingWords.has(word));
    if (newWords.length === 0) return this.handleError('没有新的单词需要添加');
    this.setData({ isParsing: true });
    wx.showLoading({ title: `正在解析 ${newWords.length} 个单词...`, mask: true });
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
        }, () => {
          // ★★★ 新增：解析完成后自动保存 ★★★
          this.autoSaveAfterParse();
        });
      }
      if (failedCount > 0) wx.showToast({ title: `${failedCount} 个词未找到`, icon: 'none' });
      else if (successfulWords.length > 0) wx.showToast({ title: '添加成功', icon: 'success', duration: 1500 });
    });
  },

  // ★★★ 新增：解析后自动保存的方法 ★★★
  async autoSaveAfterParse() {
    const title = this.data.homeworkTitle.trim();
    if (!title) { 
      wx.showToast({ title: '请先输入作业标题', icon: 'none' });
      return;
    }
    if (this.data.wordListForHomework.length === 0) { 
      return;
    }

    // 保存到数据库前，移除临时的 style 属性，保持数据纯净
    const wordsToSave = this.data.wordListForHomework.map(({ style, ...rest }) => rest);

    const homeworkData = {
      name: title,
      words: wordsToSave,
      creatorOpenId: app.globalData.userInfo._openid,
      createTime: new Date()
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
        const addResult = await homeworksCollection.add({ data: homeworkData });
        // 如果是新建模式，保存成功后更新页面状态为编辑模式
        if (addResult._id) {
          this.setData({ 
            isEditMode: true, 
            homeworkId: addResult._id 
          });
        }
      }
      console.log('自动保存成功');
    } catch (err) {
      console.error('自动保存失败:', err);
      wx.showToast({ title: '自动保存失败', icon: 'none' });
    }
  },

  // ★★★ 优化：统一的自动保存方法 ★★★
  async autoSaveAfterEdit() {
    const title = this.data.homeworkTitle.trim();
    if (!title) { 
      return;
    }
    if (this.data.wordListForHomework.length === 0) { 
      return;
    }

    // 保存到数据库前，移除临时的 style 属性，保持数据纯净
    const wordsToSave = this.data.wordListForHomework.map(({ style, ...rest }) => rest);

    const homeworkData = {
      name: title,
      words: wordsToSave,
      creatorOpenId: app.globalData.userInfo._openid,
      createTime: new Date()
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
        const addResult = await homeworksCollection.add({ data: homeworkData });
        // 如果是新建模式，保存成功后更新页面状态为编辑模式
        if (addResult._id) {
          this.setData({ 
            isEditMode: true, 
            homeworkId: addResult._id 
          });
        }
      }
      console.log('编辑后自动保存成功');
    } catch (err) {
      console.error('编辑后自动保存失败:', err);
      wx.showToast({ title: '自动保存失败', icon: 'none' });
    }
  },
  removeWord: function (e) {
    const wordToRemove = e.currentTarget.dataset.word;
    const newList = this.data.wordListForHomework.filter(item => item.word !== wordToRemove);
    this.setData({ wordListForHomework: newList }, () => {
      // ★★★ 新增：删除单词后自动保存 ★★★
      this.autoSaveAfterEdit();
    });
    wx.vibrateShort({ type: 'light' });
  },
  onTypeChange: function(e) {
    const index = e.currentTarget.dataset.index;
    const type = e.detail.value ? 'sp' : 'mc';
    this.setData({ [`wordListForHomework[${index}].type`]: type }, () => {
      // ★★★ 新增：切换题型后自动保存 ★★★
      this.autoSaveAfterEdit();
    });
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
      const wordData = data?.ec?.word?.[0];
      if (!wordData) return null;
      const meanings = wordData.trs?.map(tr => {
        const translation = tr.tr?.[0]?.l?.i?.[0];
        if (!translation) return null;
        const parts = translation.match(/^([a-z]+\.)\s*(.*)$/);
        return { pos: parts?.[1] || 'n.', def: parts?.[2] || translation };
      }).filter(Boolean);
      if (meanings && meanings.length > 0) {
        return {
          id: Date.now() + Math.random(),
          word: originalWord,
          phonetics: `[${wordData.ukphone || ''}]`,
          meanings: meanings,
          type: 'mc',
          style: '' // 新解析的单词也带上 style 属性
        };
      }
      return null;
    } catch (e) { return null; }
  },
  handleError: function(title) {
    wx.showToast({ title: title, icon: 'none' });
  }
});