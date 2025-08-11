// 统一缓存管理工具
const CACHE_KEYS = {
  userInfo: 'cache_userInfo',
  homeworkList: 'cache_homeworkList',
  leaderboard: 'cache_leaderboard',
  avatarUrls: 'cache_avatarUrls',
  userStats: 'cache_userStats'
};

// 缓存有效期（分钟）
const CACHE_DURATION = {
  userInfo: 60,        // 1小时
  homeworkList: 30,    // 30分钟  
  leaderboard: 15,     // 15分钟
  avatarUrls: 1440,    // 24小时
  userStats: 120       // 2小时
};

class CacheManager {
  // 设置缓存
  static set(key, data, customDuration = null) {
    try {
      const duration = customDuration || CACHE_DURATION[key] || 30;
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: Date.now() + (duration * 60 * 1000)
      };
      wx.setStorageSync(CACHE_KEYS[key] || key, cacheData);
      console.log(`缓存设置成功: ${key}, 有效期: ${duration}分钟`);
    } catch (error) {
      console.warn(`缓存设置失败: ${key}`, error);
    }
  }

  // 获取缓存
  static get(key) {
    try {
      const cacheData = wx.getStorageSync(CACHE_KEYS[key] || key);
      if (!cacheData || !cacheData.timestamp) {
        return null;
      }

      // 检查是否过期
      if (Date.now() > cacheData.expiry) {
        this.remove(key);
        console.log(`缓存已过期: ${key}`);
        return null;
      }

      console.log(`缓存命中: ${key}`);
      return cacheData.data;
    } catch (error) {
      console.warn(`缓存读取失败: ${key}`, error);
      return null;
    }
  }

  // 检查缓存是否有效
  static isValid(key) {
    try {
      const cacheData = wx.getStorageSync(CACHE_KEYS[key] || key);
      return cacheData && cacheData.expiry && Date.now() < cacheData.expiry;
    } catch (error) {
      return false;
    }
  }

  // 删除缓存
  static remove(key) {
    try {
      wx.removeStorageSync(CACHE_KEYS[key] || key);
      console.log(`缓存删除: ${key}`);
    } catch (error) {
      console.warn(`缓存删除失败: ${key}`, error);
    }
  }

  // 清空所有缓存
  static clearAll() {
    try {
      Object.values(CACHE_KEYS).forEach(key => {
        wx.removeStorageSync(key);
      });
      console.log('所有缓存已清空');
    } catch (error) {
      console.warn('清空缓存失败', error);
    }
  }

  // 获取缓存信息
  static getInfo() {
    const info = {};
    Object.entries(CACHE_KEYS).forEach(([key, storageKey]) => {
      try {
        const cacheData = wx.getStorageSync(storageKey);
        info[key] = {
          exists: !!cacheData,
          valid: this.isValid(key),
          size: cacheData ? JSON.stringify(cacheData).length : 0,
          expiry: cacheData ? new Date(cacheData.expiry).toLocaleString() : null
        };
      } catch (error) {
        info[key] = { exists: false, valid: false, size: 0, error: error.message };
      }
    });
    return info;
  }
}

// 头像URL缓存专用工具
class AvatarCache {
  static KEY = 'cache_avatarUrls';

  // 批量获取头像URL（带缓存）
  static async getUrls(cloudFileIds) {
    if (!Array.isArray(cloudFileIds) || cloudFileIds.length === 0) {
      return new Map();
    }

    // 从缓存读取，确保兼容Map和Object格式
    let cached = CacheManager.get('avatarUrls') || {};
    if (!(cached instanceof Map)) {
      // 将对象转换为Map，兼容旧版本缓存
      const tempMap = new Map();
      Object.entries(cached).forEach(([key, value]) => {
        tempMap.set(key, value);
      });
      cached = tempMap;
    }
    
    const result = new Map();
    const needConvert = [];

    cloudFileIds.forEach(fileId => {
      if (cached.has(fileId)) {
        result.set(fileId, cached.get(fileId));
      } else {
        needConvert.push(fileId);
      }
    });

    // 转换未缓存的文件
    if (needConvert.length > 0) {
      try {
        console.log(`转换${needConvert.length}个头像URL`);
        const res = await wx.cloud.getTempFileURL({ 
          fileList: needConvert,
          timeout: 8000 // 8秒超时
        });
        
        (res.fileList || []).forEach(item => {
          if (item.status === 0 && item.tempFileURL) {
            result.set(item.fileID, item.tempFileURL);
            cached.set(item.fileID, item.tempFileURL);
          }
        });

        // 更新缓存 - 将Map转换为Object以便存储
        const cacheObject = {};
        cached.forEach((value, key) => {
          cacheObject[key] = value;
        });
        CacheManager.set('avatarUrls', cacheObject);
      } catch (error) {
        console.warn('批量转换头像失败:', error);
      }
    }

    return result;
  }

  // 单个头像URL获取（带缓存）
  static async getUrl(cloudFileId) {
    if (!cloudFileId || !cloudFileId.startsWith('cloud://')) {
      return cloudFileId || '/images/avatar.png';
    }

    const urlMap = await this.getUrls([cloudFileId]);
    return urlMap.get(cloudFileId) || '/images/avatar.png';
  }
}

// 导出
module.exports = {
  CacheManager,
  AvatarCache,
  CACHE_KEYS,
  CACHE_DURATION
};
