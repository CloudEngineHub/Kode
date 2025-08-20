# Clean Architecture Solution

## 原则：Keep It Simple

### ✅ 正确的设计

```typescript
// messages.tsx - 保持简洁
if (input.includes('@')) {
  // 只处理文件引用
  processedInput = await resolveFileReferences(processedInput)
}
```

### ❌ 错误的设计

- 在消息层检测 @agent
- 注入 system-reminder
- 修改用户输入
- 复杂的异步处理

## Agent 功能的正确实现

Agent 功能已经通过 Task 工具正确实现：

```typescript
// 用户可以直接使用
Task tool with subagent_type="dao-qi-harmony-designer"
```

不需要 @agent 语法糖，因为：
1. 增加了不必要的复杂性
2. 破坏了消息流的纯净性
3. 原始 Kode 没有这个功能

## 架构原则

1. **消息层**：只负责文件内容嵌入
2. **工具层**：处理 agent 配置
3. **模型层**：自然选择合适的工具

## 结论

移除所有 @agent 相关的复杂逻辑，保持原始的简洁设计。