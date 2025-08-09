# 数据库索引配置指南

## 🎯 目的
解决小程序调试器中的数据库查询性能警告，提升查询效率。

## 📋 需要创建的索引

### 1. homework_records 集合
```javascript
// 在微信开发者工具 -> 云开发 -> 数据库 -> homework_records 集合中创建索引

// 索引1: userOpenId (单字段索引)
{
  "userOpenId": 1
}

// 索引2: userOpenId + createTime (复合索引)
{
  "userOpenId": 1,
  "createTime": -1
}
```

### 2. homeworks 集合
```javascript
// 在微信开发者工具 -> 云开发 -> 数据库 -> homeworks 集合中创建索引

// 索引1: createTime (单字段索引)
{
  "createTime": -1
}

// 索引2: creatorOpenId + createTime (复合索引，如果需要按创建者过滤)
{
  "creatorOpenId": 1,
  "createTime": -1
}
```

### 3. users 集合
```javascript
// 索引1: _openid (单字段索引)
{
  "_openid": 1
}
```

## 🛠️ 创建步骤

1. **打开微信开发者工具**
2. **进入云开发控制台**
   - 点击工具栏的"云开发"按钮
   - 选择对应的环境 (cloud1-2gysfwk2b569a3e5)

3. **进入数据库管理**
   - 点击左侧菜单的"数据库"
   - 选择对应的集合

4. **创建索引**
   - 点击"索引管理"标签
   - 点击"添加索引"
   - 输入索引字段和排序方式
   - 点击"确定"创建

## ⚡ 预期效果

创建索引后，以下查询将显著提升性能：

- ✅ `homework_records.where({ userOpenId: 'xxx' })` 
- ✅ `homeworks.orderBy('createTime', 'desc')`
- ✅ `users.where({ _openid: 'xxx' })`

## 🔍 验证方法

1. 创建索引后重新运行小程序
2. 查看调试器控制台，确认警告消失
3. 观察查询响应时间是否改善

## 📝 注意事项

- 索引会占用一定存储空间
- 写入操作会稍微变慢（因为需要更新索引）
- 但查询性能会显著提升
- 建议在生产环境中也创建相同的索引


