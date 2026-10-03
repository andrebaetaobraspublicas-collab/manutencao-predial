// Adapter entry point. Called after all engines/UI modules and before boot.
// An authenticated SaaS entry must install its factory before loading entry.js.
const install = window.ORCAPRO_INFRA_CONFIG?.installAdapter;
if (install) install(window.OP);
