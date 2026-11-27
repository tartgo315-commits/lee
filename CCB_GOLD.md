# 建行黄金积存报价

来源页面：https://gold.ccb.com/chn/home/gold_new/cpjs/index.shtml
页面脚本：/uiFramework/commonResource/zip/cn/cn/gold_new/js/operate_cpjs.js

页面先请求同源 /tran/WCCMainPlatV5?CCB_IBSVersion=V5&SERVLET_NAME=WCCMainPlatV5&TXCODE=100119 获取匿名会话，再请求 TXCODE=NGJS01。保存匿名会话 Cookie，不使用客户登录信息。

只接受 SUCCESS=true、retCode=000000、品种33、币种156；估值取 Cst_Sell_Prc（客户赎回价），Cst_Buy_Prc 为客户主动买入价。Tms 为银行北京时间，fetchedAt 为获取时间，两者不混用。请求总超时12秒，不调用其他金价来源。

网页每60秒尝试刷新（后台标签页受浏览器节流影响）。多个入口合并在途请求。只更新名称或账户识别为建行/建设银行/CCB的黄金持仓。失败时保留单价、克数、成本和最后有效报价；失败即标记过期，报价超过180秒也标记过期。较旧报价、缺失时间或非建行来源不能覆盖现价。旧参考估值保留并标记来源未核实。没有修改账户、交易、快照或数据库结构。

goldQuote / goldQuoteFailedAt 为行情元数据，不计为资产编辑，不触发云账本版本竞争；有效报价保存在现有浏览器账本中，与原有本机保存方式一致。

验证：_test_ccb_gold.mjs 覆盖字段与时间校验、匿名会话、失败、并发、过期、旧报价、数据保留及60秒周期；_test_cloud_sync.mjs 覆盖新元数据不会引起账本写入。原有计算、估值拆分、行情代理、登录保护及单价显示测试通过。上线后需在已登录原站核实Cloudflare服务器实际请求与页面显示。
