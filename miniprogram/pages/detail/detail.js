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
    showCelebration: false,
    canPrevReview: false,
    canNextReview: false,

    // 新增：错误反馈和自动跳转相关
    showErrorFeedback: false,
    correctAnswerText: '',
    retryButtonDisabled: false,
    continueButtonDisabled: true, // 初始禁用，0.8秒后启用
    isAutoProgressing: false,
    currentQuestionRetried: false, // 当前题目是否已重试过
    autoProgressTimer: null
  },

  onLoad(options) {
    if (options.role) this.setData({ userRole: options.role });
    correctAudio.src = '/audios/correct-156911.mp3';
    errorAudio.src = '/audios/error-05-199276.mp3';

    // 统一音频状态管理（空闲/播放中/已结束）
    this._audioState = 'idle';
    this._visualLock = false; // 交互锁
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
      spStageClass: '',
      // 重置新增的状态
      showErrorFeedback: false,
      correctAnswerText: '',
      retryButtonDisabled: false,
      continueButtonDisabled: true,
      isAutoProgressing: false,
      currentQuestionRetried: false
    }, () => {
      // 进入新题，释放交互锁
      this._visualLock = false;
      // 进题自动发音
      this.playWordAudio(this.data.currentQuestion.word);
      if (this.data.currentQuestion.type === 'sp' && this.data.useTileSpelling) {
        this.setupSpellingTiles(this.data.currentQuestion.answer);
      } else {
        this.setData({ letterBank: [], chosenLetters: [] });
      }
      this.updateReviewAvailability();
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
    const cleanWord = this.sanitizeWord(wordInfo.word);
    return { 
      type: 'sp', 
      word: cleanWord, 
      phonetics: wordInfo.phonetics, 
      question: this.aggregateMeanings(wordInfo.meanings), 
      answer: cleanWord 
    };
  },

  // 移除非字母字符，修复如 “frighten/” 的脏数据
  sanitizeWord(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/[^a-zA-Z]/g, '');
  },

  playWordAudio(eventOrWord) {
    let wordToPlay = '';
    if (typeof eventOrWord === 'string') wordToPlay = eventOrWord;
    else if (eventOrWord && eventOrWord.currentTarget && eventOrWord.currentTarget.dataset) {
      wordToPlay = eventOrWord.currentTarget.dataset.word;
    }
    if (!wordToPlay) return;

    // 若已有发音在播，默认不打断（遵循不中断策略）
    if (this._audioState === 'playing') {
      console.log('音频播放中，忽略新的播放请求');
      return;
    }

    const urls = [
      `https://dict.youdao.com/dictvoice?type=0&audio=${encodeURIComponent(wordToPlay)}`,
      `https://dict.youdao.com/dictvoice?type=1&audio=${encodeURIComponent(wordToPlay)}`
    ];

    let idx = 0;
    const tryPlay = () => {
      try { wordAudio.stop(); } catch(_) {}
      this._audioState = 'playing';

      wordAudio.offEnded && wordAudio.offEnded();
      wordAudio.offError && wordAudio.offError();
      wordAudio.offCanplay && wordAudio.offCanplay();

      wordAudio.src = urls[idx];

      wordAudio.onEnded(() => {
        this._audioState = 'ended';
      });
      wordAudio.onError((error) => {
        console.warn('音频错误', error);
        if (idx < urls.length - 1) { idx += 1; tryPlay(); return; }
        this._audioState = 'ended';
      });
      wordAudio.onCanplay(() => { /* 可播放 */ });

      try { wordAudio.play(); } catch (e) { 
        if (idx < urls.length - 1) { idx += 1; tryPlay(); return; }
        this._audioState = 'ended';
      }
    };
    tryPlay();
  },

  // ===== 拼写题：字母卡片 =====
  setupSpellingTiles(word) {
    const letters = (word || '').split('');
    const bank = letters.map((ch, i) => ({ char: ch, used: false, picked: false, idx: i }));
    
    this.setData({ 
      letterBank: this.shuffle(bank), 
      chosenLetters: [], 
      chosenShake: false
    });
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
    // 添加isRetried字段到答题记录
    summaryList.push({ 
      word: wordInfo.word, 
      def: this.aggregateMeanings(wordInfo.meanings), 
      isCorrect,
      isRetried: this.data.currentQuestionRetried // 记录是否重试过
    });
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

    // 保存答题快照，供“上一个”回看
    this.saveAnswerSnapshot();
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
    if (this._visualLock || this.data.isAnswered) return; // 交互互斥
    this._visualLock = true;
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
    
    // 播放单词发音
    this.playWordAudio(this.data.currentQuestion.word);

    const afterFlow = async () => {
      if (isCorrect) {
        // 答对：等视觉反馈与音频完成后再跳
        wx.vibrateShort({ type: 'medium' });
        await this.waitVisualAndAudio(800, 1600);
        this.handleCorrectAnswer();
        this._visualLock = false; // 切题流程内部会重新生成题并释放锁
      } else {
        // 答错：显示覆盖层，并释放锁（由覆盖层按钮再加锁）
        wx.vibrateShort({ type: 'heavy' });
        this.handleIncorrectAnswer(correctAnswer);
        this._visualLock = false;
      }
    };
    afterFlow();
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
      // 取消对/错提示音，播放目标单词发音
      this.playWordAudio(this.data.currentQuestion.word);
      
      // 答对后无需重新生成例句，例句在进入题目时已显示
      
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
      
      // 播放目标单词发音（替代错误提示音）
      wx.vibrateShort({ type: 'heavy' });
      this.playWordAudio(this.data.currentQuestion.word);

      // 答错后无需重新生成例句，例句在进入题目时已显示
    }
  },

  // 处理正确答案：自动跳转下一题（等待逻辑在外部完成）
  handleCorrectAnswer() {
    console.log('答对了，准备自动跳转下一题');
    this.setData({ isAutoProgressing: true });
    // 短暂停顿以显示提示，然后立刻进入下一题
    this.data.autoProgressTimer = setTimeout(() => {
      this.setData({ isAutoProgressing: false });
      this.nextWord();
    }, 300);
  },

  // 处理错误答案：显示错误反馈层
  handleIncorrectAnswer(correctAnswer) {
    console.log('答错了，显示错误反馈层');
    
    this.setData({
      showErrorFeedback: true,
      correctAnswerText: correctAnswer,
      retryButtonDisabled: false,
      continueButtonDisabled: true // 初始禁用继续按钮
    });

    // 0.8秒后启用继续按钮，引导用户先看反馈
    setTimeout(() => {
      this.setData({ continueButtonDisabled: false });
    }, 800);
  },

  // 再试一次
  retryQuestion() {
    if (this._visualLock) return;
    this._visualLock = true;
    console.log('用户选择再试一次');
    
    if (this.data.currentQuestionRetried) {
      wx.showToast({ title: '每题只能重试一次', icon: 'none' });
      return;
    }

    // 重置选项状态
    const resetOptions = this.data.currentQuestion.options.map(opt => ({
      ...opt,
      status: ''
    }));

    this.setData({
      showErrorFeedback: false,
      isAnswered: false,
      'currentQuestion.options': resetOptions,
      currentQuestionRetried: true
    });

    // 将错选项置灰
    setTimeout(() => {
      const grayedOptions = this.data.currentQuestion.options.map(opt => {
        if (opt.def !== this.data.correctAnswerText && opt.status === '') {
          return { ...opt, status: 'disabled' };
        }
        return opt;
      });
      this.setData({ 'currentQuestion.options': grayedOptions });
      this._visualLock = false; // 释放锁
    }, 100);
  },

  // 跳过到下一题
  async goToNextQuestion() {
    if (this._visualLock) return;
    this._visualLock = true;
    console.log('用户选择继续下一题');
    this.setData({ showErrorFeedback: false });
    await this.waitVisualAndAudio(800, 1600);
    this.nextWord();
    this._visualLock = false;
  },

  // 保存答题快照（用于回看已做过的题目）
  saveAnswerSnapshot() {
    const idx = this.data.currentWordIndex;
    if (!this._snapshots) this._snapshots = [];
    const q = this.data.currentQuestion || {};
    if (q.type === 'mc') {
      this._snapshots[idx] = {
        mode: 'mc',
        word: q.word,
        phonetics: q.phonetics,
        options: (q.options || []).map(o => ({ ...o })),
        answer: q.answer
      };
    } else if (q.type === 'sp') {
      const chosen = (this.data.chosenLetters || []).map(c => c.char).join('') || this.data.userSpellingInput || '';
      this._snapshots[idx] = {
        mode: 'sp',
        word: q.word,
        phonetics: q.phonetics,
        question: q.question,
        answer: q.answer,
        chosen,
        spellingDiff: this.data.spellingDiff,
        spStageClass: this.data.spStageClass
      };
    }
    this.updateReviewAvailability();
  },

  // 回看上一题（展示已完成界面，不可重新作答）
  prevWordReview() {
    if (!this._snapshots) return;
    const i = Math.max(0, this.data.currentWordIndex - 1);
    this.setData({ currentWordIndex: i }, () => this.showSnapshot(i));
  },

  showSnapshot(i) {
    const snap = this._snapshots && this._snapshots[i];
    if (!snap) { this.generateQuestion(); return; }
    if (snap.mode === 'mc') {
      this.setData({
        currentQuestion: { type: 'mc', word: snap.word, phonetics: snap.phonetics, options: snap.options, answer: snap.answer },
        isAnswered: true,
        smartCards: this.data.smartCards || []
      });
    } else {
      const chosenLetters = (snap.chosen || '').split('').map(ch => ({ char: ch }));
      this.setData({
        currentQuestion: { type: 'sp', word: snap.word, phonetics: snap.phonetics, question: snap.question, answer: snap.answer },
        isAnswered: true,
        chosenLetters,
        spStageClass: snap.spStageClass || '',
        spellingDiff: snap.spellingDiff || null,
        smartCards: this.data.smartCards || []
      });
    }
  },

  // 纠错建议（启发式）
  analyzeSpellingError(user, correct) {
    if (!user || !correct) return '';
    const u = user.split('');
    const c = correct.split('');
    // 相邻换位
    if (u.length === c.length) {
      const diffIdx = [];
      for (let i = 0; i < c.length; i++) if (u[i] !== c[i]) diffIdx.push(i);
      if (diffIdx.length === 2 && diffIdx[1] === diffIdx[0] + 1 && u[diffIdx[0]] === c[diffIdx[1]] && u[diffIdx[1]] === c[diffIdx[0]]) {
        return `注意顺序：把 “${c[diffIdx[0]]}${c[diffIdx[1]]}” 写反了。`;
      }
      if (diffIdx.length === 1) {
        const i = diffIdx[0];
        const similarGroups = [
          ['i','l','1'], ['o','0'], ['u','v'], ['m','n'],
          ['b','d','p','q'], ['c','e'], ['s','z'], ['g','q'], ['t','f']
        ];
        const hit = similarGroups.find(g => g.includes(u[i]) && g.includes(c[i]));
        if (hit) return `易混淆字母：把 “${c[i]}” 看成了 “${u[i]}”。`;
        return `可能把 “${c[i]}” 写成了 “${u[i]}”，请逐字对照。`;
      }
    }
    // 少写/多写 1 个字符
    if (u.length + 1 === c.length) {
      let i = 0, j = 0;
      while (i < u.length && j < c.length) { if (u[i] === c[j]) { i++; j++; } else { return `少写了字母 “${c[j]}”。`; } }
      if (j < c.length) return `少写了字母 “${c[j]}”。`;
    }
    if (u.length === c.length + 1) {
      let i = 0, j = 0;
      while (i < u.length && j < c.length) { if (u[i] === c[j]) { i++; j++; } else { return `多写了字母 “${u[i]}”。`; } }
      if (i < u.length) return `多写了字母 “${u[i]}”。`;
    }
    return '按照发音节奏，慢一点逐字拼写；必要时分段回想单词结构。';
  },
  // 轻量智能内容选择器：从词典接口抓取数据，生成不超过3条卡片
  async prepareSmartCards(word, question) {
    try {
      console.log('开始为单词加载智能卡片:', word);
      
      // 若教师编辑时删得很"干净"，也要尽力补全；允许并发加载，超时静默
      const timeout = (p) => new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => { 
          if (!done) {
            console.log('API超时:', p);
            resolve(null); 
          }
        }, 2000);  // 增加超时时间到2秒
        p.then(v => { done = true; clearTimeout(t); resolve(v); }).catch(e => { 
          console.log('API异常:', e);
          done = true; clearTimeout(t); resolve(null); 
        });
      });

      const [sentence, etym, synonyms, phrases] = await Promise.all([
        timeout(this.fetchExampleSentence(word)),
        timeout(this.fetchEtymology(word)),
        timeout(this.fetchSynonyms(word)),
        timeout(this.fetchPhrases(word)),
      ]);

      console.log('API结果:', { sentence, etym, synonyms, phrases });

      const cards = [];
      if (sentence) cards.push({ title: '例句', content: sentence });
      if (etym) cards.push({ title: '词源', content: etym });
      if (synonyms) cards.push({ title: '同/近义', content: synonyms });
      if (phrases) cards.push({ title: '常见搭配', content: phrases });

      // 兜底模板：当外部接口均为空时给出一条轻提示
      if (cards.length === 0) {
        console.log('所有API均无结果，使用fallback');
        const fallback = this.buildFallbackTip(word, question);
        if (fallback) cards.push({ title: '记忆提示', content: fallback });
      }
      
      console.log('最终智能卡片:', cards);
      this.setData({ smartCards: (cards || []).slice(0, 3) });
    } catch (e) { 
      console.error('prepareSmartCards异常:', e);
    }
  },

  // 已废弃的方法，保留以防其他地方引用
  getRandomObject() {
    const objects = ['books', 'homework', 'exercise', 'practice', 'music'];
    return objects[Math.floor(Math.random() * objects.length)];
  },

  getChineseAction() {
    const actions = ['学习', '练习', '阅读', '思考', '工作'];
    return actions[Math.floor(Math.random() * actions.length)];
  },



  buildFallbackTip(word, question) {
    // 保留但简化，主要用于调试
    return `${word} - 记忆小贴士`;
  },

  fetchExampleSentence(word) {
    return new Promise((resolve) => {
      const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`;
      wx.request({
        url,
        success: (res) => {
          try {
            // 简单取首条例句（若存在），并去掉 html tag，避免“显示不完整/被标签断行”的问题
            const sentence = res.data && res.data.blng_sents_part && res.data.blng_sents_part.sents && res.data.blng_sents_part.sents[0];
            if (sentence && sentence.eng && sentence.chn) {
              const eng = String(sentence.eng).replace(/<[^>]+>/g, '');
              const chn = String(sentence.chn).replace(/<[^>]+>/g, '');
              resolve(`${eng} \n${chn}`);
              return;
            }
          } catch (_) {}
          resolve(null);
        },
        fail: () => resolve(null)
      });
    });
  },

  fetchEtymology(word) {
    return new Promise((resolve) => {
      const url = `https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${encodeURIComponent(word)}`;
      wx.request({
        url,
        success: (res) => {
          try {
            const data = res.data;
            if (data.etym && data.etym.etyms && data.etym.etyms.zh) {
              const text = (data.etym.etyms.zh.value || '').replace(/<[^>]+>/g, '');
              resolve(text);
              return;
            }
          } catch (_) {}
          resolve(null);
        },
        fail: () => resolve(null)
      });
    });
  },

  fetchSynonyms(word) {
    return new Promise((resolve) => {
      const url = `https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${encodeURIComponent(word)}`;
      wx.request({
        url,
        success: (res) => {
          try {
            const rels = res.data && res.data.rel_word && res.data.rel_word.rels;
            if (rels && rels.length > 0) {
              // 混合不同类别的联想词，提高“新鲜感”
              const buckets = rels.slice(0,3); // 取最多前三类
              const pick = [];
              buckets.forEach(b => {
                (b.words || []).slice(0,2).forEach(w => pick.push(w.word));
              });
              const words = pick.slice(0,6).join(', ');
              if (words) {
                resolve(words);
                return;
              }
            }
          } catch (_) {}
          resolve(null);
        },
        fail: () => resolve(null)
      });
    });
  },

  // 常见搭配/短语（从 jsonapi_s 中的 phrs 提取多条，健壮解析）
  fetchPhrases(word) {
    return new Promise((resolve) => {
      const url = `https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${encodeURIComponent(word)}`;
      wx.request({
        url,
        success: (res) => {
          try {
            const phrs = res.data && res.data.phrs && res.data.phrs.phrs;
            if (phrs && Array.isArray(phrs) && phrs.length > 0) {
              const list = [];
              
              for (let i = 0; i < Math.min(3, phrs.length); i++) {
                const p = phrs[i];
                if (!p || !p.phr) continue;
                
                // 安全提取短语
                let headword = '';
                if (p.phr.headword && typeof p.phr.headword === 'string') {
                  headword = p.phr.headword.replace(/<[^>]+>/g, '').trim();
                }
                
                // 安全提取翻译
                let translation = '';
                try {
                  const trs = p.phr.trs;
                  if (trs && Array.isArray(trs) && trs[0] && trs[0].tr && trs[0].tr.l && trs[0].tr.l.i) {
                    const trans = trs[0].tr.l.i;
                    translation = Array.isArray(trans) ? String(trans[0] || '') : String(trans || '');
                    translation = translation.replace(/<[^>]+>/g, '').trim();
                  }
                } catch (e) {
                  continue;
                }
                
                if (headword && translation) {
                  list.push(`${headword}：${translation}`);
                }
              }
              
              if (list.length > 0) {
                resolve(list.join('；'));
                return;
              }
            }
          } catch(error) {
            console.log('短语解析异常:', error);
          }
          resolve(null);
        },
        fail: () => resolve(null)
      });
    });
  },

  onTileSpellingSubmit() { this.onSpellingSubmit(); },

  generateSpellingDiff(userInput, correctAnswer) {
    const userChars = userInput.split('');
    const correctChars = correctAnswer.split('');
    
    // 用户答案：所有字母都显示为错误（红色），避免混淆
    const userDiff = userChars.map(char => ({ char, status: 'incorrect' }));
    
    // 正确答案：所有字母都显示为正确（绿色）
    const correctDiff = correctChars.map(char => ({ char, status: 'correct' }));
    
    return {
      userInput: userDiff,
      correctAnswer: correctDiff
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

  // 等待视觉动画与音频播放的工具函数
  waitVisualAndAudio(minWaitMs = 800, maxWaitMs = 1600) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const elapsed = Date.now() - start;
        const audioDone = this._audioState === 'ended' || this._audioState === 'idle';
        if (elapsed >= maxWaitMs) { resolve(); return; }
        if (elapsed >= minWaitMs && audioDone) { resolve(); return; }
        setTimeout(check, 50);
      };
      check();
    });
  },

  nextWord() {
    // 清除自动跳转定时器
    if (this.data.autoProgressTimer) {
      clearTimeout(this.data.autoProgressTimer);
      this.data.autoProgressTimer = null;
    }

    if (this.data.currentWordIndex < this.data.totalWords - 1) {
      this.setData({ currentWordIndex: this.data.currentWordIndex + 1 }, () => this.generateQuestion());
    } else {
      console.log('最后一题完成，调用 finishPractice');
      this.finishPractice();
    }
  },

  // 计算回看可用性（只能在已作答范围内自由回看）
  updateReviewAvailability() {
    const answeredMax = (this._snapshots ? this._snapshots.length : 0) - 1; // 已完成最大索引
    const i = this.data.currentWordIndex;
    this.setData({
      canPrevReview: i > 0 && !!(this._snapshots && this._snapshots[i - 1]),
      canNextReview: i < answeredMax
    });
  },

  onPrevTap() { if (this.data.canPrevReview) this.prevWordReview(); },
  onNextTap() {
    // 仅允许在已完成范围内前进回看
    const answeredMax = (this._snapshots ? this._snapshots.length : 0) - 1;
    const next = Math.min(this.data.currentWordIndex + 1, answeredMax);
    if (next > this.data.currentWordIndex) {
      this.setData({ currentWordIndex: next }, () => this.showSnapshot(next));
    }
  },

  // 轻滑手势：左滑下一题（回看），右滑上一题（回看）
  onTouchStart(e) { this._touchX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0; },
  onTouchEnd(e) {
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
    const dx = endX - (this._touchX || 0);
    const threshold = 40; // 40px 轻滑阈值
    if (dx > threshold && this.data.canPrevReview) {
      this.prevWordReview();
    } else if (dx < -threshold && this.data.canNextReview) {
      this.onNextTap();
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
          device: 'miniprogram'
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

  // 页面卸载时清理定时器
  onUnload() {
    if (this.data.autoProgressTimer) {
      clearTimeout(this.data.autoProgressTimer);
      this.data.autoProgressTimer = null;
    }
    // 确保离开页面时释放交互锁与音频状态
    this._visualLock = false;
    try { wordAudio.stop(); } catch (_) {}
    this._audioState = 'idle';
  },

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