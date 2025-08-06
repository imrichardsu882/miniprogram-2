const defaultDB = require('./database.js'); // 引入我们的默认数据模板
const STORAGE_KEY = 'homeworks_db'; // 定义笔记本的名字

// 从笔记本读取作业
function loadHomeworks() {
  const dbFromStorage = wx.getStorageSync(STORAGE_KEY);
  if (dbFromStorage) {
    // 如果笔记本里有，就用笔记本里的
    return dbFromStorage;
  } else {
    // 如果笔记本是空的（第一次使用），就用我们的默认模板
    return defaultDB.homeworks;
  }
}

// 把作业写入笔记本
function saveHomeworks(homeworks) {
  wx.setStorageSync(STORAGE_KEY, homeworks);
}

module.exports = {
  loadHomeworks: loadHomeworks,
  saveHomeworks: saveHomeworks
};