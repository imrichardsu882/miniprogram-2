// pages/create/create.js
const storage = require('../../utils/storage.js');

Page({
  data: {
    // ... (之前的data属性不变) ...
    isEditMode: false,
    homeworkId: null,
    homeworkTitle: '',
    wordsToParse: '',
    isParsing: false,
    wordListForHomework: [],
    titleChangeTimer: null,

    // ★★★ 新增：用于单词编辑浮层的状态 ★★★
    isEditingWord: false, // 控制浮层显示
    editingWordIndex: -1, // 正在编辑的单词索引
    editingWordData: { // 正在编辑的单词数据副本
      word: '',
      phonetics: '',
      meaningsStr: ''
    },
  },

  // ... (onLoad, onUnload, _autoSave, onTitleInput 函数不变) ...
  onLoad: function (options) {
    if (options.id) {
      const homeworkId = Number(options.id);
      const allHomeworks = storage.loadHomeworks();
      const homeworkToEdit = allHomeworks.find(hw => hw.id === homeworkId);
      if (homeworkToEdit) {
        this.setData({
          isEditMode: true,
          homeworkId: homeworkId,
          homeworkTitle: homeworkToEdit.name,
          wordListForHomework: homeworkToEdit.words
        });
        wx.setNavigationBarTitle({ title: '编辑作业' });
      }
    } else {
      wx.setNavigationBarTitle({ title: '创建新作业' });
      this.setData({ isEditMode: false });
    }
  },
  onUnload: function() {
    if (this.data.homeworkTitle || this.data.wordListForHomework.length > 0) {
      this._autoSave();
    }
  },
  _autoSave: function() {
    if (this.isSaving) return;
    this.isSaving = true;
    wx.showNavigationBarLoading();
    const title = this.data.homeworkTitle.trim();
    const words = this.data.wordListForHomework;
    let currentId = this.data.homeworkId;
    if (!this.data.isEditMode && !currentId) {
      if (!title && words.length === 0) {
        this.isSaving = false;
        wx.hideNavigationBarLoading();
        return;
      }
      currentId = Date.now();
      this.setData({ homeworkId: currentId, isEditMode: true });
    }
    const allHomeworks = storage.loadHomeworks();
    const homeworkIndex = allHomeworks.findIndex(hw => hw.id === currentId);
    const homeworkData = { id: currentId, name: title, words: words };
    if (homeworkIndex > -1) {
      allHomeworks[homeworkIndex] = homeworkData;
    } else {
      allHomeworks.push(homeworkData);
    }
    storage.saveHomeworks(allHomeworks);
    setTimeout(() => {
      wx.hideNavigationBarLoading();
      this.isSaving = false;
    }, 500);
  },
  onTitleInput: function(e) {
    this.setData({ homeworkTitle: e.detail.value });
    if (this.data.titleChangeTimer) clearTimeout(this.data.titleChangeTimer);
    const timer = setTimeout(() => { this._autoSave(); }, 1000);
    this.setData({ titleChangeTimer: timer });
  },

  // ★★★ 新增：单词编辑相关函数 ★★★
  editWord: function(e) {
    const index = e.currentTarget.dataset.index;
    const wordData = this.data.wordListForHomework[index];
    
    // 将数组形式的meanings转换为字符串，方便textarea编辑
    const meaningsStr = wordData.meanings.map(m => `${m.pos} ${m.def}`).join('\n');
    
    this.setData({
      isEditingWord: true,
      editingWordIndex: index,
      editingWordData: {
        word: wordData.word,
        phonetics: wordData.phonetics,
        meaningsStr: meaningsStr
      }
    });
  },

  closeEditModal: function() {
    this.setData({ isEditingWord: false });
  },
  
  // 防止点击浮层内容时关闭
  preventModalClose: function() {},

  onEditInput: function(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`editingWordData.${field}`]: e.detail.value
    });
  },

  saveWordEdit: function() {
    const index = this.data.editingWordIndex;
    const { phonetics, meaningsStr } = this.data.editingWordData;

    // 将字符串形式的meaningsStr再解析回数组对象
    const newMeanings = meaningsStr.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.trim().match(/^([a-z]+\.)\s*(.*)$/);
      return {
        pos: parts ? parts[1] : 'n.',
        def: parts ? parts[2] : line.trim()
      };
    });

    this.setData({
      [`wordListForHomework[${index}].phonetics`]: phonetics,
      [`wordListForHomework[${index}].meanings`]: newMeanings,
      isEditingWord: false // 关闭浮层
    }, () => {
      this._autoSave(); // 触发自动保存
    });
  },

  // 阻止冒泡，防止点击switch时触发整个item的editWord事件
  onSwitchChange: function(e) {},

  // ... (其余函数 parseAndAddWords, removeWord, onTypeChange 等保持不变, 只需确保它们调用了 _autoSave) ...
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
          this._autoSave();
        });
      }
      if (failedCount > 0) wx.showToast({ title: `${failedCount} 个词未找到`, icon: 'none' });
      else if (successfulWords.length > 0) wx.showToast({ title: '添加成功', icon: 'success' });
    });
  },
  removeWord: function (e) {
    const wordToRemove = e.currentTarget.dataset.word;
    const newList = this.data.wordListForHomework.filter(item => item.word !== wordToRemove);
    this.setData({ wordListForHomework: newList }, () => {
      this._autoSave();
    });
    wx.vibrateShort({ type: 'light' });
  },
  onTypeChange: function(e) {
    const index = e.currentTarget.dataset.index;
    const type = e.detail.value ? 'sp' : 'mc';
    this.setData({
      [`wordListForHomework[${index}].type`]: type
    }, () => {
      this._autoSave();
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
          type: 'mc'
        };
      }
      return null;
    } catch (e) { return null; }
  },
  handleError: function(title) {
    wx.showToast({ title: title, icon: 'none' });
  }
});