# 块类型参考

一堂(yitang.top)课程文档使用飞书文档格式，数据存储在 Vue 组件的 `dataJson.childrens` 中。

## 数据结构

```
dataJson.childrens (1029 个顶层块)
  ├── blockId: string
  ├── type: number (块类型)
  ├── blockAttr: object (块属性)
  │   ├── text / heading1 / heading2 / ... (文本属性)
  │   │   └── elements: [{ text_run: { content: "文本" } }]
  │   ├── cdnUrl: string (图片 URL)
  │   ├── image: { width, height, token }
  │   ├── divider: {} (分隔线)
  │   ├── grid: { column_size: N } (网格)
  │   └── grid_column: {} (网格列)
  └── childrens: [] (子块，递归同结构)
```

## 已知块类型

### 文本类
- **type 2 (text)**: 段落文本，`blockAttr.text.elements`
- **type 3 (heading1)**: 一级标题，`blockAttr.heading1.elements`
- **type 4 (heading2)**: 二级标题，`blockAttr.heading2.elements`
- **type 9 (heading3?)**: 三级标题
- **type 12 (ordered)**: 有序列表项，`blockAttr.ordered.elements`
- **type 13 (bullet)**: 无序列表项，`blockAttr.bullet.elements`

### 媒体类
- **type 27 (image)**: 图片，URL 在 `blockAttr.cdnUrl`

### 布局类（容器，递归处理 children）
- **type 22 (divider)**: 分隔线，`blockAttr.divider`
- **type 24 (grid)**: 网格布局，children 是 type 25
- **type 25 (grid_column)**: 网格列，children 是实际内容
- **type 31 (table)**: 表格，children 是行列
- **type 34 (column)**: 列布局

### 文本提取逻辑

```javascript
// 遍历所有可能的属性 key
var keys = ["page","heading1","heading2","heading3","heading4","heading5",
            "text","ordered","bullet","quote","todo","callout"];
for (var key of keys) {
  var val = blockAttr[key];
  if (val && val.elements) {
    var txt = val.elements.map(e => e.text_run.content).join("");
    // 根据 key 添加 markdown 前缀
  }
}
```

### 注意事项

1. 图片 URL 在 `blockAttr.cdnUrl`，不在 `blockAttr.image.cdnUrl`
2. `JSON.stringify` 会将中文转为 `\uXXXX`，不能用 `indexOf` 搜索中文
3. 虚拟滚动只渲染可见块，`innerText` 只能获取当前可见内容
4. 必须从 Vue 组件数据提取，不能从 DOM 提取
