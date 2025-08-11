// 性能优化工具集

// 防抖函数
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

// 节流函数
function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function(...args) {
    if (!lastRan) {
      func.apply(this, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// 批量setData优化
class BatchSetData {
  constructor(page, delay = 16) { // 16ms约等于60fps
    this.page = page;
    this.delay = delay;
    this.pendingData = {};
    this.timeoutId = null;
  }

  // 添加数据到批次
  add(data) {
    Object.assign(this.pendingData, data);
    this.scheduleUpdate();
  }

  // 安排更新
  scheduleUpdate() {
    if (this.timeoutId) return;
    
    this.timeoutId = setTimeout(() => {
      if (Object.keys(this.pendingData).length > 0) {
        this.page.setData(this.pendingData);
        this.pendingData = {};
      }
      this.timeoutId = null;
    }, this.delay);
  }

  // 立即执行更新
  flush() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (Object.keys(this.pendingData).length > 0) {
      this.page.setData(this.pendingData);
      this.pendingData = {};
    }
  }
}

// 并行请求工具
class ParallelLoader {
  constructor() {
    this.tasks = [];
    this.results = new Map();
  }

  // 添加任务
  add(key, promise) {
    this.tasks.push({ key, promise });
    return this;
  }

  // 执行所有任务
  async execute() {
    try {
      const promises = this.tasks.map(task => 
        task.promise.then(result => ({ key: task.key, result, success: true }))
                   .catch(error => ({ key: task.key, error, success: false }))
      );

      const results = await Promise.all(promises);
      
      results.forEach(({ key, result, error, success }) => {
        if (success) {
          this.results.set(key, result);
        } else {
          console.warn(`并行任务失败: ${key}`, error);
          this.results.set(key, null);
        }
      });

      return this.results;
    } catch (error) {
      console.error('并行加载失败:', error);
      return this.results;
    }
  }

  // 获取结果
  get(key) {
    return this.results.get(key);
  }
}

// 预加载管理器
class PreloadManager {
  constructor() {
    this.preloadData = new Map();
    this.loadingPromises = new Map();
  }

  // 预加载数据
  async preload(key, loader, force = false) {
    // 如果已有数据且不强制刷新，直接返回
    if (!force && this.preloadData.has(key)) {
      return this.preloadData.get(key);
    }

    // 如果正在加载，返回loading promise
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key);
    }

    // 开始加载
    const promise = loader().then(data => {
      this.preloadData.set(key, data);
      this.loadingPromises.delete(key);
      console.log(`预加载完成: ${key}`);
      return data;
    }).catch(error => {
      this.loadingPromises.delete(key);
      console.warn(`预加载失败: ${key}`, error);
      return null;
    });

    this.loadingPromises.set(key, promise);
    return promise;
  }

  // 获取预加载的数据
  get(key) {
    return this.preloadData.get(key);
  }

  // 检查是否有预加载数据
  has(key) {
    return this.preloadData.has(key);
  }

  // 清除预加载数据
  clear(key = null) {
    if (key) {
      this.preloadData.delete(key);
      this.loadingPromises.delete(key);
    } else {
      this.preloadData.clear();
      this.loadingPromises.clear();
    }
  }
}

// 网络状态检测
class NetworkMonitor {
  constructor() {
    this.isOnline = true;
    this.networkType = 'unknown';
    this.listeners = [];
    this.init();
  }

  init() {
    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      this.isOnline = res.isConnected;
      this.networkType = res.networkType;
      this.notifyListeners(res);
    });

    // 获取初始网络状态
    wx.getNetworkType({
      success: (res) => {
        this.networkType = res.networkType;
        this.isOnline = res.networkType !== 'none';
      }
    });
  }

  // 添加监听器
  addListener(callback) {
    this.listeners.push(callback);
  }

  // 移除监听器
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 通知所有监听器
  notifyListeners(status) {
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.warn('网络状态监听器错误:', error);
      }
    });
  }

  // 获取当前网络状态
  getStatus() {
    return {
      isOnline: this.isOnline,
      networkType: this.networkType,
      isWifi: this.networkType === 'wifi',
      isMobile: ['2g', '3g', '4g', '5g'].includes(this.networkType)
    };
  }

  // 检查是否为弱网环境
  isWeakNetwork() {
    return ['2g', '3g'].includes(this.networkType) || !this.isOnline;
  }
}

// 性能监控
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  // 开始计时
  start(key) {
    this.metrics.set(key, { startTime: Date.now() });
  }

  // 结束计时
  end(key) {
    const metric = this.metrics.get(key);
    if (metric) {
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;
      console.log(`性能指标 ${key}: ${metric.duration}ms`);
      return metric.duration;
    }
    return 0;
  }

  // 获取指标
  get(key) {
    return this.metrics.get(key);
  }

  // 清除指标
  clear() {
    this.metrics.clear();
  }

  // 获取所有指标
  getAll() {
    const result = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}

// 创建全局实例
const globalPreloadManager = new PreloadManager();
const globalNetworkMonitor = new NetworkMonitor();
const globalPerformanceMonitor = new PerformanceMonitor();

module.exports = {
  debounce,
  throttle,
  BatchSetData,
  ParallelLoader,
  PreloadManager,
  NetworkMonitor,
  PerformanceMonitor,
  // 全局实例
  preloadManager: globalPreloadManager,
  networkMonitor: globalNetworkMonitor,
  performanceMonitor: globalPerformanceMonitor
};

