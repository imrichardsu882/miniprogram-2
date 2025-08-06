// pages/detail/detail.js
const storage = require('../../utils/storage.js');
const { demoCourse } = require('../../utils/demoData.js');
const correctAudio = wx.createInnerAudioContext();
const errorAudio = wx.createInnerAudioContext();
const wordAudio = wx.createInnerAudioContext();
const app = getApp();

Page({
  data: {
    homework: null,
    totalWords: 0,
    currentWordIndex: 0,
    currentQuestion: null,
    isAnswered: false,
    feedback: { type: '', message: '', sentence: null, sentenceTrans: null },
    userSpellingInput: '',
    spellingFeedbackClass: '',
    spellingDiff: null, 
    progress: 0,
    correctCount: 0,
    isFinished: false,
    score: '0%',
    summaryList: [],
    userRole: 'student'
  },

  onLoad: function (options) {
    if(options.role) {
      this.setData({ userRole: options.role });
    }
    correctAudio.src = '/audios/correct-156911.mp3';
    errorAudio.src = '/audios/error-05-199276.mp3';

    let homework = null;
    // 关键修正：只有游客(guest)才加载静态数据
    if (options.id === 'guest_course') {
      homework = demoCourse;
    } else {
      // 学生(student)和教师预览(preview)都从本地缓存加载真实数据
      const homeworkId = Number(options.id);
      const allHomeworks = storage.loadHomeworks();
      homework = allHomeworks.find(hw => hw.id === homeworkId);
    }

    if (homework && homework.words.length > 0) {
      this.setData({
        homework: { ...homework, title: homework.name, words: this.shuffle(homework.words) },
        totalWords: homework.words.length
      });
      this.generateQuestion();
    } else {
      wx.showToast({ title: '作业加载失败或为空', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  generateQuestion: function () {
    const { homework, currentWordIndex } = this.data;
    const wordInfo = homework.words[currentWordIndex];

    let question = {};
    if (wordInfo.type === 'mc') {
      question = this.generateMcQuestion(wordInfo);
    } else {
      question = this.generateSpQuestion(wordInfo);
    }
    
    this.setData({
      currentQuestion: question,
      isAnswered: false,
      userSpellingInput: '',
      spellingFeedbackClass: '',
      spellingDiff: null,
      feedback: { type: '', message: '', sentence: null, sentenceTrans: null },
      progress: ((currentWordIndex) / this.data.totalWords) * 100,
    }, () => {
      this.playWordAudio(this.data.currentQuestion.word);
    });
  },

  aggregateMeanings(meanings, maxLength = 30) {
    if (!meanings || meanings.length === 0) return '暂无释义';
    const meaningGroups = meanings.reduce((acc, m) => {
      if (!acc[m.pos]) acc[m.pos] = [];
      acc[m.pos].push(m.def.split(/[;,，；]/)[0]);
      return acc;
    }, {});
    let aggregated = [];
    for (const pos in meaningGroups) {
      let currentMeaning = `${pos} ${meaningGroups[pos][0]}`;
      if (aggregated.join('; ').length + currentMeaning.length > maxLength && aggregated.length > 0) break;
      aggregated.push(currentMeaning);
    }
    if (aggregated.length === 0) return meanings[0].def;
    let finalString = aggregated.join('; ');
    if (finalString.length > maxLength + 5) return finalString.substring(0, maxLength + 2) + '...';
    return finalString;
  },
  
  generateMcQuestion: function (wordInfo) {
    const correctAnswerDef = this.aggregateMeanings(wordInfo.meanings);
    const distractors = this.data.homework.words.filter(w => w.word !== wordInfo.word);
    let wrongOptions = this.shuffle(distractors).slice(0, 3).map(w => ({ def: this.aggregateMeanings(w.meanings) }));
    const options = this.shuffle([{ def: correctAnswerDef, status: '' }, ...wrongOptions.map(opt => ({ ...opt, status: '' }))]);
    this.fetchExampleSentence(wordInfo.word).then(sentenceResult => {
      if(sentenceResult && sentenceResult.sentence) {
        this.setData({ 'currentQuestion.sentenceHint': sentenceResult.sentence.replace(new RegExp(wordInfo.word, 'ig'), '______') });
      }
    });
    return { type: 'mc', word: wordInfo.word, phonetics: wordInfo.phonetics, options: options, answer: correctAnswerDef, sentenceHint: null };
  },

  generateSpQuestion: function (wordInfo) {
    return { type: 'sp', word: wordInfo.word, phonetics: wordInfo.phonetics, question: this.aggregateMeanings(wordInfo.meanings), answer: wordInfo.word };
  },
  
  playWordAudio: function(eventOrWord) {
    let wordToPlay = '';
    if (typeof eventOrWord === 'string') {
      wordToPlay = eventOrWord;
    } else if (eventOrWord && eventOrWord.currentTarget && eventOrWord.currentTarget.dataset) {
      wordToPlay = eventOrWord.currentTarget.dataset.word;
    }
    if (wordToPlay) {
      wordAudio.src = `https://dict.youdao.com/dictvoice?type=0&audio=${wordToPlay}`;
      wordAudio.play();
    }
  },

  handleAnswer: function(isCorrect) {
    const wordInfo = this.data.homework.words[this.data.currentWordIndex];
    let feedback = {};

    const summaryList = this.data.summaryList;
    summaryList.push({ word: wordInfo.word, def: this.aggregateMeanings(wordInfo.meanings), isCorrect: isCorrect });
    this.setData({ summaryList });

    if (isCorrect) {
      if (correctAudio.src) correctAudio.play();
      this.setData({ correctCount: this.data.correctCount + 1 });
      feedback.type = 'correct';
      feedback.message = '回答正确！';
      this.fetchExampleSentence(wordInfo.word).then(sentenceResult => {
        if (sentenceResult && sentenceResult.sentence) {
          feedback.sentence = sentenceResult.sentence;
          feedback.sentenceTrans = sentenceResult.sentenceTrans;
        }
        this.setData({ feedback });
      }).catch(() => {
        this.setData({ feedback });
      });
    } else {
      if (errorAudio.src) errorAudio.play();
      if (this.data.currentQuestion.type === 'mc') {
        feedback.type = 'incorrect';
        feedback.message = '回答错误';
        this.setData({ feedback });
      }
    }
  },

  fetchExampleSentence: function(word) {
    const apiUrl = `https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${word}`;
    return new Promise((resolve) => {
      wx.request({
        url: apiUrl,
        success: (res) => {
          try {
            const fanyi = res.data.fanyi; if (fanyi && fanyi.tran) { resolve({ sentence: word, sentenceTrans: fanyi.tran }); return; }
            const blngSents = res.data.blng_sents_part; if (blngSents && blngSents['sentence-pair'] && blngSents['sentence-pair'].length > 0) { const firstSentence = blngSents['sentence-pair'][0]; const sentence = firstSentence.sentence.replace(/<\/?b>/g, ''); const sentenceTrans = firstSentence['sentence-translation']; resolve({ sentence, sentenceTrans }); return; }
            resolve(null);
          } catch (e) { resolve(null); }
        },
        fail: () => { resolve(null); }
      });
    });
  },

  onMcOptionTap: function (e) {
    if (this.data.isAnswered) return;
    wx.vibrateShort({ type: 'light' });
    const userAnswer = e.currentTarget.dataset.optionDef;
    const correctAnswer = this.data.currentQuestion.answer;
    const isCorrect = userAnswer === correctAnswer;
    const newOptions = this.data.currentQuestion.options.map(opt => {
      if (opt.def === correctAnswer) opt.status = 'correct';
      else if (opt.def === userAnswer) opt.status = 'incorrect';
      return opt;
    });
    this.setData({ isAnswered: true, 'currentQuestion.options': newOptions });
    this.handleAnswer(isCorrect);
  },

  onSpellingSubmit: function() {
    if (this.data.isAnswered || !this.data.userSpellingInput) return;
    wx.vibrateShort({ type: 'light' });
    const userAnswer = this.data.userSpellingInput.trim().toLowerCase();
    const correctAnswer = this.data.currentQuestion.answer.toLowerCase();
    const isCorrect = userAnswer === correctAnswer;
    this.setData({ isAnswered: true });
    if (isCorrect) {
      this.setData({ spellingFeedbackClass: 'correct' });
      this.handleAnswer(true);
    } else {
      this.setData({ spellingFeedbackClass: 'incorrect', spellingDiff: this.generateSpellingDiff(userAnswer, correctAnswer) });
      this.handleAnswer(false);
    }
  },

  generateSpellingDiff: function(userInput, correctAnswer) {
    const userChars = userInput.split('');
    const correctChars = correctAnswer.split('');
    const maxLength = Math.max(userChars.length, correctChars.length);
    let diffResult = [];
    for (let i = 0; i < maxLength; i++) {
      const userChar = userChars[i]; const correctChar = correctChars[i];
      if (userChar && userChar === correctChar) { diffResult.push({ char: userChar, status: 'correct' }); } 
      else { if(userChar) { diffResult.push({ char: userChar, status: 'incorrect' }); } }
    }
    return { userInput: diffResult, correctAnswer: correctChars.map(char => ({ char: char, status: 'correct' })) };
  },

  nextWord: function () {
    if (this.data.currentWordIndex < this.data.totalWords - 1) {
      this.setData({ currentWordIndex: this.data.currentWordIndex + 1 }, () => this.generateQuestion());
    } else {
      this.finishPractice();
    }
  },

  finishPractice: function() {
    const score = this.data.totalWords > 0 ? Math.round((this.data.correctCount / this.data.totalWords) * 100) : 100;

    this.setData({
      progress: 100, 
      isFinished: true,
      score: score + '%'
    });

    if (this.data.userRole === 'student' && app.globalData.userInfo && app.globalData.userInfo._openid) {
      const db = wx.cloud.database();
      db.collection('homework_records').add({
        data: {
          homeworkId: this.data.homework.id,
          homeworkTitle: this.data.homework.title,
          score: score,
          totalWords: this.data.totalWords,
          correctCount: this.data.correctCount,
          completionTime: new Date()
        },
        success: res => { console.log('[数据库] [新增功勋记录] 成功, 记录 _id: ', res._id) },
        fail: err => { console.error('[数据库] [新增功勋记录] 失败：', err) }
      });
    }
  },

  goBack: function() { wx.navigateBack(); },
  
  shuffle: function (array) {
    let newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [newArr[i], newArr[j]] = [newArr[j], newArr[i]]; }
    return newArr;
  },

  onSpellingInput: function(e) { this.setData({ userSpellingInput: e.detail.value }); },
});