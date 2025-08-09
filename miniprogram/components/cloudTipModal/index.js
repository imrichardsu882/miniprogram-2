// pages/create/create.js
const storage = require('../../utils/storage.js');

Page({
  data: {
    isEditMode: false,
    homeworkId: null,
    homeworkTitle: '',
    wordsToParse: '',
    isParsing: false,
    wordListForHomework: [],
    touchStartX: 0,
    touchStartY: 0,
    currentTouchIndex: null,
  },

  onLoad: function(options) {
    if (options.id) {
      const homeworkId = Number(options.id);
      const allHomeworks = storage.loadHomeworks();
      const homeworkToEdit = allHomeworks.find(function(hw) { return hw.id === homeworkId; });
      if (homeworkToEdit) {
        this.setData({
          isEditMode: true,
          homeworkId: homeworkId,
          homeworkTitle: homeworkToEdit.name,
          wordListForHomework: homeworkToEdit.words.map(function(word) {
            word.style = '';
            return word;
          })
        });
        wx.setNavigationBarTitle({ title: '编辑作业' });
      } else {
        this.handleError('无法加载该作业');
      }
    } else {
      wx.setNavigationBarTitle({ title: '创建新作业' });
    }
  },

  onTitleInput: function(e) { this.setData({ homeworkTitle: e.detail.value }); },
  onWordsInput: function(e) { this.setData({ wordsToParse: e.detail.value }); },

  parseAndAddWords: function() {
    var that = this;
    var text = this.data.wordsToParse;
    if (!text.trim()) return this.handleError('请输入或粘贴单词');
    var rawWords = text.replace(/[,，\n\t]/g, ' ').split(' ');
    var uniqueWords = [];
    for (var i = 0; i < rawWords.length; i++) {
      var word = rawWords[i].trim();
      if (word && uniqueWords.indexOf(word) === -1) uniqueWords.push(word);
    }
    var existingWords = this.data.wordListForHomework.map(function(item) { return item.word; });
    var newWords = [];
    for (var j = 0; j < uniqueWords.length; j++) {
      if (existingWords.indexOf(uniqueWords[j]) === -1) newWords.push(uniqueWords[j]);
    }
    if (newWords.length === 0) return this.handleError('没有新的单词需要添加');
    this.setData({ isParsing: true });
    wx.showLoading({ title: '解析中...', mask: true });
    var promises = newWords.map(function(word) { return that.fetchSingleWord(word); });
    Promise.all(promises).then(function(results) {
      that.setData({ isParsing: false });
      wx.hideLoading();
      var successfulWords = [];
      results.forEach(function(result) { if (result) successfulWords.push(result); });
      if (successfulWords.length > 0) {
        that.setData({
          wordListForHomework: successfulWords.concat(that.data.wordListForHomework),
          wordsToParse: '',
        });
      }
      var failedCount = newWords.length - successfulWords.length;
      if (failedCount > 0) wx.showToast({ title: failedCount + '个词未找到', icon: 'none' });
    }).catch(function(error) {
      console.error('解析单词失败:', error);
      that.setData({ isParsing: false });
      wx.hideLoading();
      wx.showToast({ title: '解析失败，请重试', icon: 'none' });
    });
  },

  fetchSingleWord: function(word) {
    var that = this;
    return new Promise(function(resolve) {
      wx.request({
        url: 'https://dict.youdao.com/jsonapi?q=' + word,
        success: function(res) {
          resolve(that.parseYoudaoData(res.data, word));
        },
        fail: function() {
          resolve(null);
        }
      });
    });
  },

  parseYoudaoData: function(data, originalWord) {
    try {
      if (!data.ec || !data.ec.word || !data.ec.word[0]) return null;
      var wordData = data.ec.word[0];
      var meanings = [];
      if (wordData.trs) {
        wordData.trs.forEach(function(tr) {
          var translation = tr.tr && tr.tr[0] && tr.tr[0].l && tr.tr[0].l.i && tr.tr[0].l.i[0];
          if (translation) {
            var parts = translation.match(/^([a-z]+\.)\s*(.*)$/);
            if (parts && parts.length === 3) {
              meanings.push({ pos: parts[1], def: parts[2] });
            } else {
              meanings.push({ pos: 'n.', def: translation });
            }
          }
        });
      }
      if (meanings.length > 0) {
        return {
          id: Date.now() + Math.random(),
          word: originalWord,
          phonetics: '[' + (wordData.ukphone || '') + ']',
          meanings: meanings,
          style: '' // 确保新词有style属性
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  publishHomework: function() {
    var title = this.data.homeworkTitle.trim();
    if (!title) return this.handleError('请输入作业标题');
    if (this.data.wordListForHomework.length === 0) return this.handleError('请先添加单词');
    var allHomeworks = storage.loadHomeworks();
    var wordsToSave = this.data.wordListForHomework.map(function(word) {
      // 移除style属性，避免存入缓存
      var cleanWord = { ...word };
      delete cleanWord.style;
      return cleanWord;
    });
    if (this.data.isEditMode) {
      var index = -1;
      for (var i = 0; i < allHomeworks.length; i++) {
        if (allHomeworks[i].id === this.data.homeworkId) {
          index = i;
          break;
        }
      }
      if (index !== -1) {
        allHomeworks[index].name = title;
        allHomeworks[index].words = wordsToSave;
      }
    } else {
      allHomeworks.push({ id: Date.now(), name: title, words: wordsToSave });
    }
    storage.saveHomeworks(allHomeworks);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(function() { wx.navigateBack(); }, 1000);
  },

  touchStart: function(e) {
    var list = this.data.wordListForHomework;
    list.forEach(function(item) { item.style = ''; });
    this.setData({
      wordListForHomework: list,
      touchStartX: e.touches[0].clientX,
      touchStartY: e.touches[0].clientY,
      currentTouchIndex: e.currentTarget.dataset.index
    });
  },
  touchMove: function(e) {
    var index = this.data.currentTouchIndex;
    if (index === null) return;
    var moveX = e.touches[0].clientX;
    var deltaX = this.data.touchStartX - moveX;
    var deltaY = Math.abs(this.data.touchStartY - e.touches[0].clientY);
    if (deltaY > Math.abs(deltaX)) return;
    var style = deltaX > 40 ? 'transform: translateX(-180rpx);' : '';
    this.setData({ ['wordListForHomework[' + index + '].style']: style });
  },
  touchEnd: function() {},
  removeWord: function(e) {
    var wordToRemove = e.currentTarget.dataset.word;
    this.setData({
      wordListForHomework: this.data.wordListForHomework.filter(function(item) {
        return item.word !== wordToRemove;
      })
    });
    wx.vibrateShort({ type: 'light' });
  },
  handleError: function(title) {
    wx.showToast({ title: title, icon: 'none' });
  }
});