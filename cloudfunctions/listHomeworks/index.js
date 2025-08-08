// 云函数入口文件 - 列出所有作业（按创建时间倒序）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    const res = await db.collection('homeworks')
      .orderBy('createTime', 'desc')
      .get()
    return { ok: true, data: res.data }
  } catch (e) {
    return { ok: false, error: e.message || 'unknown error' }
  }
}