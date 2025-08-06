// utils/demoData.js
// 这是一个共享的、用于“游客”或“教师预览”模式的体验课程数据
const demoCourse = {
  id: 'preview_course',
  name: '体验课程',
  words: [
    { 
      word: 'apple', 
      meanings: [{ pos: 'n.', def: '苹果' }], 
      type: 'mc', 
      phonetics: '/ˈæpl/' 
    },
    { 
      word: 'experience', 
      meanings: [{ pos: 'n.', def: '体验；经验' }], 
      type: 'sp', 
      phonetics: '/ɪkˈspɪriəns/' 
    }
  ]
};

// 通过 module.exports 将数据暴露出去，供其他文件引用
module.exports = {
  demoCourse
}