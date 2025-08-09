// 云函数入口文件 - 列出作业（支持分页，按创建时间倒序）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    // 支持分页参数
    const { limit = 50, skip = 0, forceRefresh = false } = event || {}
    
    // 限制单次查询数量，防止全表扫描
    const queryLimit = Math.min(limit, 100) // 最大100条
    
    console.log('listHomeworks 查询参数:', { limit: queryLimit, skip, forceRefresh })
    
    const res = await db.collection('homeworks')
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(queryLimit)
      .get()
      
    console.log('listHomeworks 查询结果:', { count: res.data.length, hasMore: res.data.length === queryLimit })
      
    return { 
      ok: true, 
      data: res.data,
      count: res.data.length,
      hasMore: res.data.length === queryLimit,
      timestamp: new Date().toISOString()
    }
  } catch (e) {
    console.error('listHomeworks error:', e)
    return { ok: false, error: e.message || 'unknown error' }
  }
}





