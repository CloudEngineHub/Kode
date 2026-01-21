# 发包脚本使用指南

Kode 项目提供了两套发包流程，专注于npm发布，不涉及git操作：

## ✅ 推荐：GitHub Actions 自动发布

日常发版建议使用仓库内置的 GitHub Actions：

- **开发版（main）**：`.github/workflows/dev-release.yml`
  - 每次 `main` 更新会发布 npm `dev` dist-tag（例如 `2.0.0-dev.123`）
  - 同步创建 GitHub Prerelease，并附带二进制文件与 `checksums-sha256.txt`
- **正式版（tag）**：`.github/workflows/npm-publish.yml`
  - 推送 `v*` tag（例如 `v2.0.0`）后自动发布 npm `latest`
  - 构建多平台二进制并创建 GitHub Release（含校验和）

需要配置的 Secrets：

- `NPM_TOKEN`：具备 `@shareai-lab/kode` 发布权限的 npm token

详见：`docs/develop/releasing.md`

## 🚀 快速使用

### 开发版本发布 (测试用)

```bash
npm run publish:dev
```

### 正式版本发布

```bash
npm run publish:release
```

## 📦 发包策略

### 1. 开发版本 (`dev` tag)

- **目的**: 内部测试和预发布验证
- **版本格式**: `2.0.0-dev.1`, `2.0.0-dev.2`
- **安装方式**: `npm install -g @shareai-lab/kode@dev`
- **特点**:
  - 自动递增 dev 版本号
  - 不影响正式版本的用户
  - 可以快速迭代测试
  - 临时修改package.json，发布后自动恢复

### 2. 正式版本 (`latest` tag)

- **目的**: 面向最终用户的稳定版本
- **版本格式**: `2.0.0`, `2.0.1`, `2.1.0`
- **安装方式**: `npm install -g @shareai-lab/kode` (默认)
- **特点**:
  - 语义化版本控制
  - 严格的发布流程
  - 包含完整的测试和检查
  - 永久更新package.json版本号

## 🛠️ 脚本功能详解

### 开发版本发布 (`scripts/publish-dev.js`)

**自动化流程**:

1. 🔢 读取当前基础版本
2. 📊 查询npm上现有的dev版本，自动递增
3. 📝 临时更新package.json版本号
4. 🧰 准备平台依赖包（ripgrep / Kode 原生二进制）
5. 🔨 构建项目
6. 🔍 运行预发布检查
7. 📤 发布平台包（`@shareai-lab/kode-bin-*`、`@shareai-lab/kode-ripgrep-*`）
8. 📤 发布主包到 npm 的 `dev` dist-tag
9. 🔄 恢复 package.json 到原始版本

**使用场景**:

- 功能开发完成，需要内部测试
- PR验证前的最终测试
- 快速修复验证

**安全特性**:

- 临时修改package.json，发布后自动恢复
- 失败时自动回滚
- 不会改变本地版本状态

### 正式版本发布 (`scripts/publish-release.js`)

**交互式流程**:

1. 📦 显示当前版本
2. 🔢 选择版本升级类型:
   - **patch** (2.0.0 → 2.0.1): 修复 bug
   - **minor** (2.0.0 → 2.1.0): 新功能
   - **major** (2.0.0 → 3.0.0): 破坏性变更
   - **custom**: 自定义版本号
3. ✅ 检查版本是否已在npm上存在
4. 🤔 确认发布信息
5. 📝 更新package.json版本号（永久）
6. 🧪 运行测试和类型检查
7. 🧰 准备平台依赖包（ripgrep / Kode 原生二进制）
8. 🔨 构建项目
9. 🔍 运行预发布检查
10. 📤 发布平台包（`@shareai-lab/kode-bin-*`、`@shareai-lab/kode-ripgrep-*`）
11. 📤 发布主包到 npm（默认 `latest` tag）
12. 💡 提示后续 git 操作建议

**安全特性**:

- 交互式确认，避免误发布
- 检查版本冲突
- 测试失败时自动回滚版本号
- 永久保留版本更改供git提交

## 🎯 最佳实践

### 开发流程建议

```bash
# 1. 开发功能
# ... 开发代码 ...

# 2. 发布开发版本测试
npm run publish:dev
# 安装测试: npm install -g @shareai-lab/kode@dev

# 3. 测试通过后发布正式版本
npm run publish:release

# 4. 手动处理git操作（如需要）
git add package.json packages/kode-bin-*/package.json packages/kode-ripgrep-*/package.json
git commit -m "chore: bump version to x.x.x"
git tag vx.x.x
git push origin main
git push origin vx.x.x
```

### 版本号管理

- **开发版**: 基于当前正式版本自动递增 (2.0.0-dev.1 → 2.0.0-dev.2)
- **正式版**: 遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范
- **版本检查**: 自动检查npm上是否已存在相同版本

### 标签管理

```bash
# 查看所有版本
npm view @shareai-lab/kode versions --json

# 查看 dev 版本
npm view @shareai-lab/kode@dev version

# 查看最新正式版本
npm view @shareai-lab/kode@latest version
```

## 🔧 故障排除

### 常见问题

**发布失败怎么办？**

- 开发版本：脚本会自动回滚package.json
- 正式版本：检查错误信息，修复后重新运行

**版本号冲突？**

- 开发版本会自动递增，不会冲突
- 正式版本发布前会检查是否已存在

**权限问题？**

- 确保已登录npm: `npm whoami`
- 确保有包的发布权限: `npm owner ls @shareai-lab/kode`

**测试失败？**

- 正式版本发布会自动回滚版本号
- 修复测试问题后重新运行

### 手动操作

```bash
# 查看当前登录用户
npm whoami

# 登录npm
npm login

# 查看包信息
npm view @shareai-lab/kode

# 手动发布（不推荐）
npm publish --tag dev  # 开发版本
npm publish            # 正式版本
```

## 📊 监控和分析

```bash
# 查看包下载统计
npm view @shareai-lab/kode

# 查看所有版本的详细信息
npm view @shareai-lab/kode versions --json

# 测试安装
npm install -g @shareai-lab/kode@dev
kode --version
```

## ⚙️ Git集成建议

虽然发包脚本不包含git操作，但建议的git工作流程：

**开发版本发布后**:

```bash
# 开发版本不需要git操作，package.json已自动恢复
# 继续开发即可
```

**正式版本发布后**:

```bash
# package.json已更新版本号，建议提交
git add package.json packages/kode-bin-*/package.json packages/kode-ripgrep-*/package.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"
git push origin main
git push origin --tags
```

---

通过这套纯npm发包系统，你可以：

- 🚀 快速发布开发版本进行内部测试
- 🛡️ 安全发布正式版本给最终用户
- 📈 保持清晰的版本管理
- ⚡ 专注于包发布，git操作完全可控
- 🔄 灵活的版本回滚和恢复机制
