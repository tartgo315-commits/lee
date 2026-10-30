# Tiger 截图导入

入口：澳洲、美国页面顶部的「Tiger 截图导入」。选择目标 Tiger 账户与截图日期，上传不超过 6 MB 的 PNG/JPEG/WebP。

截图通过受站点密码保护的 `/api/tiger-import` 交给 OpenAI Responses 视觉模型。服务使用 `store:false`；本站不把截图写入账本或文件存储。上传前可遮盖姓名和账号。服务只识别持仓表，不使用左侧自选行情列表。

后台沿用 `OPENAI_API_KEY`、`SITE_PASSWORD`、`SITE_AUTH_SECRET`。可选 `TIGER_VISION_MODEL`，否则沿用 `OPENAI_MODEL`，默认 `gpt-5-mini`。密钥仅在后台配置。接口没有写账本能力。

识别结果必须人工校对：代码、数量、USD 当前价和摊薄成本、原图 USD 市值、逐行币种；账户总资产、证券总值、预估现金与盈亏以 AUD 展示，支持修改。空值、非数值、无效代码、重复持仓与非 USD 股票会阻止保存。市值不一致、未显示持仓与汇总不匹配会提示核对。

USD 原始价格与成本直接保存，AUD 折算使用主页的 USD/CNY ÷ AUD/CNY，只换算一次。截图 AUD 汇总保存为独立对账元数据 `tigerImports`，不再作为资产相加，不自动推导或覆盖现金，也不从汇总反推并修改全站汇率。

确认只合并选中的目标账户美股。截图未出现或取消勾选的持仓、其他券商、澳洲存款及所有其他资产保留；现有名称、备注、止损等资料保留。截图更新会清除对应持仓旧的分时行情元数据，后续正常行情刷新仍可更新现价。

写入前比对整个账本，发现行情刷新、其他设备或标签页变动时要求重新比较并确认。打开导入窗口期间沿用现有云同步的编辑保护。备份失败则停止写入；正式账本一次写入后再通知现有云同步。

每次写入前完整备份存于 `${SK}_tiger_backup_${timestamp}`，最近备份引用为 `${SK}_tiger_last_backup`。窗口内「下载最近一次导入前备份」可导出 JSON；恢复使用已有设置页 JSON 导入流程。备份不自动清除；存储空间不足会阻止新的导入。

持仓数量或成本变化以 correction 记录，需在原账本收益流程核对起点；价格变化以 valuation 记录。导入不是成交，不结算现金，不生成外部入出金。已有变动记录撤销功能可撤销相关持仓校正；完整备份也保留整次导入前状态。

验证：`node _test_tiger_import.mjs`；现有 `_test_cloud_sync.mjs`、`_test_movements.mjs`、`_test_ledger_workflows.mjs`、`_test_gate.mjs`、`_test_ledger_assistant.mjs`。测试使用虚构数据。
