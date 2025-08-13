# 版本更新管理指南

## 一、版本更新内容管理

### 1.1 更新内容位置
版本更新内容在以下文件中管理：
```
miniprogram/pages/index/index.js
```

### 1.2 更新内容结构
```javascript
updates: [
  {
    id: 1,                    // 唯一标识符
    title: '更新标题',        // 更新标题
    description: '更新描述',  // 更新详细描述
    read: false,              // 是否已读（false=未读，true=已读）
    timestamp: Date.now()     // 时间戳
  }
]
```

### 1.3 如何添加新版本更新

#### 步骤1：在JavaScript文件中添加更新内容
打开 `miniprogram/pages/index/index.js` 文件，找到 `data` 中的 `updates` 数组：

```javascript
// 在 data 中添加新的更新项
updates: [
  {
    id: 4, // 新的ID（递增）
    title: '新增功能标题',
    description: '详细的功能描述，支持多行文本',
    read: false, // 新更新默认为未读
    timestamp: Date.now() // 当前时间戳
  },
  // ... 其他现有更新
]
```

#### 步骤2：更新示例
```javascript
// 示例：添加新功能更新
{
  id: 4,
  title: '新增智能推荐功能',
  description: '基于学习进度智能推荐练习内容，提升学习效率',
  read: false,
  timestamp: Date.now()
}

// 示例：添加优化更新
{
  id: 5,
  title: '性能优化升级',
  description: '优化页面加载速度，提升用户体验',
  read: false,
  timestamp: Date.now()
}
```

### 1.4 红点逻辑说明

#### 红点显示规则
- **开始练习模块**：有新作业发布时显示红点
- **版本更新模块**：有未读更新时显示红点
- **其他模块**：不显示红点

#### 红点消失规则
- **开始练习**：用户点击进入练习页面后，红点自动消失
- **版本更新**：用户点击查看更新内容后，红点自动消失

#### 红点重新显示规则
- 当有新内容发布时，红点会重新出现
- 时间间隔：7天内有新内容时显示红点

## 二、版本更新界面说明

### 2.1 界面布局
- **位置**：位于首页底部
- **高度**：最大300px，超出部分可滚动
- **滚动**：只有版本更新区域滚动，主页其他部分不滚动

### 2.2 显示内容
- **标题**：更新功能标题
- **描述**：详细功能说明
- **状态**：未读/已读状态
- **红点**：未读更新显示红点

### 2.3 交互功能
- **点击查看**：点击更新卡片查看详情
- **自动标记已读**：查看后自动标记为已读
- **红点消失**：已读后红点自动消失

## 三、管理建议

### 3.1 更新频率
- **建议频率**：每1-2周发布一次更新
- **重要更新**：重要功能发布时及时更新
- **小版本**：bug修复等小更新可合并发布

### 3.2 内容规范
- **标题简洁**：控制在15字以内
- **描述详细**：说明具体功能和改进
- **语言友好**：使用用户易懂的语言

### 3.3 版本控制
- **ID管理**：确保每个更新有唯一ID
- **时间戳**：使用准确的时间戳
- **状态管理**：正确设置已读/未读状态

## 四、技术实现细节

### 4.1 数据结构
```javascript
// 更新项数据结构
{
  id: Number,           // 唯一标识
  title: String,        // 标题
  description: String,  // 描述
  read: Boolean,        // 已读状态
  timestamp: Number     // 时间戳
}
```

### 4.2 状态管理
```javascript
// 检查版本更新
checkVersionUpdates() {
  const updates = this.data.updates;
  const hasUnread = updates.some(update => !update.read);
  const unreadCount = updates.filter(update => !update.read).length;
  
  this.setData({
    hasUnreadUpdates: hasUnread,
    unreadCount: unreadCount
  });
}

// 查看更新详情
viewUpdate(e) {
  const update = e.currentTarget.dataset.update;
  if (!update) return;
  
  // 标记为已读
  const updates = this.data.updates.map(u => {
    if (u.id === update.id) {
      return { ...u, read: true };
    }
    return u;
  });
  
  this.setData({ updates });
  this.checkVersionUpdates();
}
```

### 4.3 样式控制
```css
/* 版本更新区域样式 */
.updates-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 300px; /* 固定最大高度 */
}

.updates-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto; /* 垂直滚动 */
  overflow-x: hidden; /* 禁止水平滚动 */
}
```

## 五、常见问题

### 5.1 如何批量添加更新？
可以一次性添加多个更新项：
```javascript
updates: [
  // 现有更新...
  {
    id: 4,
    title: '功能更新1',
    description: '描述1',
    read: false,
    timestamp: Date.now() - 24 * 60 * 60 * 1000 // 1天前
  },
  {
    id: 5,
    title: '功能更新2',
    description: '描述2',
    read: false,
    timestamp: Date.now() // 现在
  }
]
```

### 5.2 如何清空所有更新？
将 `updates` 数组设置为空：
```javascript
updates: []
```

### 5.3 如何重置所有更新为未读？
将所有更新项的 `read` 设置为 `false`：
```javascript
updates: updates.map(update => ({ ...update, read: false }))
```

## 六、最佳实践

### 6.1 更新内容建议
- **功能更新**：新功能、功能优化
- **性能改进**：速度提升、稳定性改进
- **界面优化**：UI改进、用户体验提升
- **Bug修复**：重要bug修复

### 6.2 发布时间建议
- **工作日**：周二到周四发布，用户活跃度高
- **重要更新**：选择用户使用高峰期发布
- **避免时间**：周末和节假日避免发布

### 6.3 内容质量建议
- **准确性**：确保描述内容准确无误
- **完整性**：提供完整的功能说明
- **用户导向**：从用户角度描述改进
- **简洁明了**：避免过于技术化的描述
