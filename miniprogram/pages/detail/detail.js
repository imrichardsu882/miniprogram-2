// miniprogram/pages/detail/detail.js（字母卡片版·舞台动效 + 震感音效 + 重播发音）
const db = wx.cloud.database();
const homeworksCollection = db.collection('homeworks');
const { demoCourse } = require('../../utils/demoData.js');
const correctAudio = wx.createInnerAudioContext();
const errorAudio = wx.createInnerAudioContext();
const tapAudio = wx.createInnerAudioContext();
const wordAudio = wx.createInnerAudioContext();
const app = getApp();

Page({
  data: {
    homework: null,
    totalWords: 0,
    currentWordIndex: 0,
    currentQuestion: null,
    isAnswered: false,
    feedback: { type: '', message: '', knowledge: null },
    userSpellingInput: '',
    spellingFeedbackClass: '',
    spellingDiff: null,
    progress: 0,
    correctCount: 0,
    isFinished: false,
    score: '0%',
    summaryList: [],
    userRole: 'student',
    mistakes: [],
    reviewMode: false,

    // 拼写题（字母卡片）相关
    useTileSpelling: true,
    letterBank: [],       // [{char, used, picked, idx}]
    chosenLetters: [],    // [{char, sourceIdx}]
    chosenShake: false,   // 删除/清空时轻微摇动
    spStageClass: '',     // 舞台状态（正确/错误上色）
    
    // 庆祝效果
    showCelebration: false
  },

  onLoad(options) {
    if (options.role) this.setData({ userRole: options.role });
    correctAudio.src = '/audios/correct-156911.mp3';
    errorAudio.src = '/audios/error-05-199276.mp3';
    // 采用已有提示音作轻点音效，降低音量
    tapAudio.src = '/audios/correct-156911.mp3';
    tapAudio.volume = 0.2;
    this._practiceStartTs = Date.now();
    this.loadSingleHomework(options.id);
  },

  async loadSingleHomework(id) {
    wx.showLoading({ title: '加载中...' });
    let homework = null;
    try {
      if (id === 'preview_course' || id === 'guest_course') {
        homework = demoCourse;
      } else {
        const res = await homeworksCollection.doc(id).get();
        homework = res.data;
        homework.id = homework._id;
      }
      if (homework && homework.words.length > 0) {
        this.setData({
          homework: { ...homework, title: homework.name, words: this.shuffle(homework.words) },
          totalWords: homework.words.length
        });
        this.generateQuestion();
      } else {
        throw new Error('作业为空');
      }
    } catch (err) {
      wx.showToast({ title: '作业加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    } finally {
      wx.hideLoading();
    }
  },

  generateQuestion() {
    const { homework, currentWordIndex } = this.data;
    const wordInfo = homework.words[currentWordIndex];

    let question = {};
    if (wordInfo.type === 'mc') question = this.generateMcQuestion(wordInfo);
    else question = this.generateSpQuestion(wordInfo);

    this.setData({
      currentQuestion: question,
      isAnswered: false,
      userSpellingInput: '',
      spellingFeedbackClass: '',
      spellingDiff: null,
      feedback: { type: '', message: '', knowledge: null },
      progress: (currentWordIndex / this.data.totalWords) * 100,
      spStageClass: ''
    }, () => {
      this.playWordAudio(this.data.currentQuestion.word);
      if (this.data.currentQuestion.type === 'sp' && this.data.useTileSpelling) {
        this.setupSpellingTiles(this.data.currentQuestion.answer);
      } else {
        this.setData({ letterBank: [], chosenLetters: [] });
      }
    });
  },

  aggregateMeanings(meanings, maxLength = 30) {
    if (!meanings || meanings.length === 0) return '暂无释义';
    const map = meanings.reduce((acc, m) => {
      if (!acc[m.pos]) acc[m.pos] = [];
      acc[m.pos].push(m.def.split(/[;,，；]/)[0]);
      return acc;
    }, {});
    const out = [];
    for (const pos in map) {
      const seg = `${pos} ${map[pos][0]}`;
      if (out.join('; ').length + seg.length > maxLength && out.length > 0) break;
      out.push(seg);
    }
    if (out.length === 0) return meanings[0].def;
    let s = out.join('; ');
    if (s.length > maxLength + 5) s = s.substring(0, maxLength + 2) + '...';
    return s;
  },

  generateMcQuestion(wordInfo) {
    const answer = this.aggregateMeanings(wordInfo.meanings);
    const distractors = this.data.homework.words.filter(w => w.word !== wordInfo.word);
    const wrong = this.shuffle(distractors).slice(0, 3).map(w => ({ def: this.aggregateMeanings(w.meanings) }));
    const options = this.shuffle([{ def: answer, status: '' }, ...wrong.map(o => ({ ...o, status: '' }))]);
    return { type: 'mc', word: wordInfo.word, phonetics: wordInfo.phonetics, options, answer };
  },

  generateSpQuestion(wordInfo) {
    return { type: 'sp', word: wordInfo.word, phonetics: wordInfo.phonetics, question: this.aggregateMeanings(wordInfo.meanings), answer: wordInfo.word };
  },

  playWordAudio(eventOrWord) {
    let wordToPlay = '';
    if (typeof eventOrWord === 'string') wordToPlay = eventOrWord;
    else if (eventOrWord && eventOrWord.currentTarget && eventOrWord.currentTarget.dataset) {
      wordToPlay = eventOrWord.currentTarget.dataset.word;
    }
    if (!wordToPlay) return;

    const urls = [
      `https://dict.youdao.com/dictvoice?type=0&audio=${encodeURIComponent(wordToPlay)}`,
      `https://dict.youdao.com/dictvoice?type=1&audio=${encodeURIComponent(wordToPlay)}`,
      // 备用：百度 TTS（在线合成），稳定性更高
      `https://tts.baidu.com/text2audio?lan=en&ie=UTF-8&spd=5&text=${encodeURIComponent(wordToPlay)}`
    ];

    let idx = 0;
    const tryPlay = () => {
      try { 
        wordAudio.stop(); 
      } catch (e) {
        console.log('停止音频播放:', e.message);
      }
      
      wordAudio.src = urls[idx];
      
      // 设置错误回调，失败则尝试下一个源
      wordAudio.onError((error) => {
        console.warn(`音频加载失败 (${idx + 1}/${urls.length}):`, urls[idx], error);
        if (idx < urls.length - 1) { 
          idx += 1; 
          tryPlay(); 
        } else {
          console.error('所有音频源都加载失败，跳过发音');
        }
      });
      
      // 设置成功回调
      wordAudio.onCanplay(() => {
        console.log('音频加载成功:', urls[idx]);
      });
      
      try {
        wordAudio.play();
      } catch (playError) {
        console.warn('音频播放失败:', playError);
        if (idx < urls.length - 1) { 
          idx += 1; 
          tryPlay(); 
        }
      }
    };
    tryPlay();
  },

  // ===== 拼写题：字母卡片 =====
  setupSpellingTiles(word) {
    const letters = (word || '').split('');
    const bank = letters.map((ch, i) => ({ char: ch, used: false, picked: false, idx: i }));
    this.setData({ letterBank: this.shuffle(bank), chosenLetters: [], chosenShake: false });
  },

  onLetterTap(e) {
    if (this.data.isAnswered) return;
    const idx = e.currentTarget.dataset.index;
    const bank = [...this.data.letterBank];
    if (!bank[idx] || bank[idx].used) return;

    // 卡片弹跳动画
    bank[idx].picked = true;
    bank[idx].used = true;
    const chosen = [...this.data.chosenLetters, { char: bank[idx].char, sourceIdx: idx }];
    this.setData({ letterBank: bank, chosenLetters: chosen });
    setTimeout(() => this.setData({ [`letterBank[${idx}].picked`]: false }), 280);

    // 交互反馈：轻微震感（移除音效）
    wx.vibrateShort({ type: 'light' });
  },

  onDeleteLast() {
    if (this.data.isAnswered) return;
    const chosen = [...this.data.chosenLetters];
    if (chosen.length === 0) return;
    const last = chosen.pop();
    const bank = [...this.data.letterBank];
    if (bank[last.sourceIdx]) bank[last.sourceIdx].used = false;
    this.setData({ chosenLetters: chosen, letterBank: bank, chosenShake: true });
    setTimeout(() => this.setData({ chosenShake: false }), 180);
    wx.vibrateShort({ type: 'medium' });
  },

  onClearLetters() {
    if (this.data.isAnswered) return;
    const bank = this.data.letterBank.map(it => ({ ...it, used: false }));
    this.setData({ chosenLetters: [], letterBank: bank, chosenShake: true });
    setTimeout(() => this.setData({ chosenShake: false }), 200);
    wx.vibrateShort({ type: 'heavy' });
  },

  // ===== 判分 =====
  handleAnswer(isCorrect) {
    const wordInfo = this.data.homework.words[this.data.currentWordIndex];
    let feedback = { type: '', message: '' };

    const summaryList = this.data.summaryList;
    summaryList.push({ word: wordInfo.word, def: this.aggregateMeanings(wordInfo.meanings), isCorrect });
    this.setData({ summaryList });

    if (isCorrect) {
      if (correctAudio.src) correctAudio.play();
      this.setData({ correctCount: this.data.correctCount + 1 });
      feedback.type = 'correct';
      feedback.message = '回答正确！';

      if (this.data.currentQuestion.type === 'mc') {
        this.fetchWordKnowledge(wordInfo.word).then(knowledge => {
          if (knowledge) feedback.knowledge = knowledge;
          this.setData({ feedback });
        });
      } else {
        this.setData({ feedback });
      }
    } else {
      if (errorAudio.src) errorAudio.play();
      feedback.type = 'incorrect';
      feedback.message = '回答错误';
      this.setData({ feedback });
    }
  },

  fetchWordKnowledge(word) {
    const apiUrl = `https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${word}`;
    return new Promise((resolve) => {
      wx.request({
        url: apiUrl,
        success: (res) => {
          try {
            const data = res.data;
            let knowledge = {};
            if (data.etym && data.etym.etyms && data.etym.etyms.zh) {
              knowledge.etymology = data.etym.etyms.zh.value.replace(/<[^>]+>/g, '');
            }
            if (data.rel_word && data.rel_word.rels) {
              knowledge.relations = data.rel_word.rels.map(rel => {
                const words = rel.words.map(w => w.word).join(', ');
                return `${rel.rel.name}：${words}`;
              });
            }
            if (data.phrs && data.phrs.phrs) {
              knowledge.phrases = data.phrs.phrs.map(p => {
                const headword = p.phr.headword.replace(/<\/?i>/g, '');
                return `${headword} ${p.phr.trs[0].tr.l.i}`;
              });
            }
            resolve(Object.keys(knowledge).length > 0 ? knowledge : null);
          } catch (e) { resolve(null); }
        },
        fail: () => resolve(null)
      });
    });
  },

  onMcOptionTap(e) {
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

    // 增强的反馈效果
    if (isCorrect) {
      wx.vibrateShort({ type: 'medium' });
      correctAudio.play();
      
      // 庆祝效果：延迟显示继续按钮
      setTimeout(() => {
        this.triggerCelebrationEffects();
      }, 400);
      
    } else {
      wx.vibrateShort({ type: 'heavy' });
      errorAudio.play();
    }
  },

  onSpellingSubmit() {
    if (this.data.isAnswered) return;
    const candidate = this.data.chosenLetters.length > 0
      ? this.data.chosenLetters.map(c => c.char).join('')
      : (this.data.userSpellingInput || '').trim();
    if (!candidate) return;

    wx.vibrateShort({ type: 'light' });
    const userAnswer = candidate.toLowerCase();
    const correctAnswer = this.data.currentQuestion.answer.toLowerCase();
    const isCorrect = userAnswer === correctAnswer;
    this.setData({ isAnswered: true });

    if (isCorrect) {
      this.setData({ spellingFeedbackClass: 'correct', spStageClass: 'stage-correct' });
      this.handleAnswer(true);
      
      // 增强的成功反馈
      wx.vibrateShort({ type: 'medium' });
      correctAudio.play();
      
      // 庆祝效果：延迟显示继续按钮，增加成就感
      setTimeout(() => {
        this.triggerCelebrationEffects();
      }, 300);
      
    } else {
      this.setData({
        spellingFeedbackClass: 'incorrect', spStageClass: 'stage-incorrect',
        spellingDiff: this.generateSpellingDiff(userAnswer, correctAnswer)
      });
      this.handleAnswer(false);
      
      // 错误反馈
      wx.vibrateShort({ type: 'heavy' });
      errorAudio.play();
    }
  },

  onTileSpellingSubmit() { this.onSpellingSubmit(); },

  generateSpellingDiff(userInput, correctAnswer) {
    const userChars = userInput.split('');
    const correctChars = correctAnswer.split('');
    const maxLength = Math.max(userChars.length, correctChars.length);
    const diff = [];
    for (let i = 0; i < maxLength; i++) {
      const u = userChars[i], c = correctChars[i];
      if (u && u === c) diff.push({ char: u, status: 'correct' });
      else if (u) diff.push({ char: u, status: 'incorrect' });
    }
    return {
      userInput: diff,
      correctAnswer: correctChars.map(char => ({ char, status: 'correct' }))
    };
  },

  // 庆祝效果
  triggerCelebrationEffects() {
    this.setData({ showCelebration: true });
    
    // 1秒后自动隐藏庆祝效果
    setTimeout(() => {
      this.setData({ showCelebration: false });
    }, 1000);
    
    console.log('✓ 答对了！触发简化庆祝效果');
  },

  nextWord() {
    if (this.data.currentWordIndex < this.data.totalWords - 1) {
      this.setData({ currentWordIndex: this.data.currentWordIndex + 1 }, () => this.generateQuestion());
    } else {
      console.log('最后一题完成，调用 finishPractice');
      this.finishPractice();
    }
  },

  finishPractice() {
    const score = this.data.totalWords > 0 ? Math.round((this.data.correctCount / this.data.totalWords) * 100) : 100;
    const mistakes = this.data.summaryList.filter(item => !item.isCorrect);
    console.log('完成练习，设置结果页状态:', { score, totalWords: this.data.totalWords, correctCount: this.data.correctCount, isFinished: true });
    
    // 立即设置结果页状态，确保页面显示
    this.setData({ 
      progress: 100, 
      isFinished: true, 
      score: score + '%', 
      mistakes 
    });

    // 异步保存记录和计算分位，不影响页面显示
    if (this.data.userRole === 'student'
      && this.data.homework.id !== 'preview_course'
      && this.data.homework.id !== 'guest_course'
      && app.globalData.userInfo
      && app.globalData.userInfo._openid) {
      const start = this._practiceStartTs || Date.now();
      const durationMs = Date.now() - start;
      const sessionId = `${app.globalData.userInfo._openid}-${Date.now()}`;
      
      // 保存练习记录
      db.collection('homework_records').add({
        data: {
          homeworkId: this.data.homework.id,
          homeworkTitle: this.data.homework.title,
          userId: app.globalData.userInfo._id || app.globalData.userInfo._openid,
          userOpenId: app.globalData.userInfo._openid,
          userName: app.globalData.userInfo.nickName || '未知用户',
          score,
          totalWords: this.data.totalWords,
          correctCount: this.data.correctCount,
          completionTime: new Date(),
          recordType: this.data.reviewMode ? 'mistake_review' : 'practice',
          durationMs,
          sessionId,
          device: wx.getSystemInfoSync ? wx.getSystemInfoSync().model : 'unknown'
        }
      }).catch(err => {
        console.error('保存练习记录失败:', err);
      });

      // 使用本地聚合查询计算分位，提升性能
      this.calculateScorePercentile(this.data.homework.id, score);
    }
  },

  retryPractice() {
    wx.showModal({
      title: '确认重新练习',
      content: '确定要重新开始这次练习吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            reviewMode: false,
            homework: { ...this.data.homework, title: (this.data.homework.name || this.data.homework.title) },
            currentWordIndex: 0, correctCount: 0, isFinished: false, score: '0%',
            summaryList: [], mistakes: [], progress: 0,
            totalWords: this.data.homework.words.length,
            letterBank: [], chosenLetters: [], chosenShake: false
          });
          this.generateQuestion();
        }
      }
    });
  },

  viewMistakes() {
    if (this.data.mistakes.length === 0) return wx.showToast({ title: '没有错题', icon: 'none' });
    wx.showModal({
      title: '错题复习',
      content: `您有 ${this.data.mistakes.length} 个错题需要复习，是否开始错题练习？`,
      confirmText: '开始复习',
      success: (res) => { if (res.confirm) this.startMistakeReview(); }
    });
  },

  startMistakeReview() {
    const mistakeWordsSet = new Set(this.data.summaryList.filter(i => !i.isCorrect).map(i => i.word));
    if (mistakeWordsSet.size === 0) return wx.showToast({ title: '没有需要复习的错题', icon: 'none' });
    const mistakeWords = this.data.homework.words.filter(w => mistakeWordsSet.has(w.word));
    const newHomework = { ...this.data.homework, title: (this.data.homework.title || this.data.homework.name) + '（错题复习）', words: this.shuffle(mistakeWords) };
    this.setData({
      reviewMode: true, homework: newHomework, totalWords: mistakeWords.length,
      currentWordIndex: 0, correctCount: 0, isFinished: false, score: '0%',
      summaryList: [], mistakes: [], progress: 0, letterBank: [], chosenLetters: [], chosenShake: false
    }, () => this.generateQuestion());
  },

  goBack() { 
    // 如果是结果页面，回到主页；否则返回上一页
    if (this.data.isFinished) {
      wx.reLaunch({ url: '/pages/index/index' });
    } else {
      wx.navigateBack();
    }
  },

  shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  onSpellingInput(e) { this.setData({ userSpellingInput: e.detail.value }); },

  // 计算分位数（本地聚合查询替代云函数）
  async calculateScorePercentile(homeworkId, score) {
    try {
      const records = db.collection('homework_records');
      
      // 获取该作业的总记录数
      const totalRes = await records.where({ homeworkId }).count();
      const total = totalRes.total || 0;
      
      if (total === 0) {
        this.setData({ percentileMeta: { total: 0, percentile: 0 } });
        return;
      }
      
      // 获取分数小于等于当前分数的记录数
      const lowerRes = await records.where({ 
        homeworkId, 
        score: db.command.lte(score) 
      }).count();
      const lowerEq = lowerRes.total || 0;
      
      // 计算分位数（排除自己）
      const percentile = Math.floor((lowerEq - 1) * 100 / total);
      const finalPercentile = Math.max(0, Math.min(100, percentile));
      
      this.setData({ 
        percentileMeta: { 
          total, 
          percentile: finalPercentile 
        } 
      });
    } catch (error) {
      console.log('分位计算失败，不影响结果页显示:', error);
    }
  }
});