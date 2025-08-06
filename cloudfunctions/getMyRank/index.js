// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 使用聚合操作获取所有用户的排名列表
    const allRanksResult = await db.collection('homework_records').aggregate()
      .group({
        _id: '$_openid',
        avgScore: db.command.avg('$score')
      })
      .sort({
        avgScore: -1
      })
      .end()

    const allRanks = allRanksResult.list
    if (allRanks.length === 0) {
      return { rank: 0, total: 0, avgScore: 0 }
    }

    // 2. 在列表中找到当前用户
    const myRankIndex = allRanks.findIndex(item => item._id === openid);

    if (myRankIndex === -1) {
      // 如果用户还未完成过任何作业
      return { rank: 0, total: allRanks.length, avgScore: 0 };
    }

    const myData = allRanks[myRankIndex];
    const myRank = myRankIndex + 1;

    return {
      rank: myRank,
      total: allRanks.length,
      avgScore: Math.round(myData.avgScore)
    }

  } catch (e) {
    console.error(e)
    return null
  }
}