// 这个文件就是我们小程序的本地数据库
const homeworks = [{
  id: 1,
  name: 'Unit 1: Core Vocabulary',
  words: [{
      id: 101,
      word: 'study',
      phonetics: "[ˈstʌdi]",
      type: 'mc',
      meanings: [{
          pos: 'v.',
          def: '学习；研究',
          sentence: 'You must study hard to pass the exam.'
      }, {
          pos: 'n.',
          def: '书房；研究',
          sentence: 'He went to his study to read.'
      }, ]
  }, {
      id: 102,
      word: 'work',
      phonetics: "[wɜːrk]",
      type: 'sp',
      meanings: [{
          pos: 'v.',
          def: '工作；运作',
          sentence: 'I have to work late tonight.'
      }, {
          pos: 'n.',
          def: '工作；作品',
          sentence: 'This is a great work of art.'
      }, ]
  }, {
      id: 103,
      word: 'read',
      phonetics: "[riːd]",
      type: 'mc',
      meanings: [{
          pos: 'v.',
          def: '阅读；朗读',
          sentence: 'I love to read books in my free time.'
      }]
  }, {
      id: 104,
      word: 'listen',
      phonetics: "[ˈlɪs(ə)n]",
      type: 'mc',
      meanings: [{
          pos: 'v.',
          def: '听；倾听',
          sentence: 'You should listen to your parents.'
      }]
  }, ]
}, ];

module.exports = {
  homeworks: homeworks
};