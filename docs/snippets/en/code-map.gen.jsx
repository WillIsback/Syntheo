// Fichier généré par scripts/code-map.mjs depuis l'index CodeGraph : ne pas modifier.
// Carte interactive de la code base (issue 761). Relancer `node scripts/code-map.mjs`
// après `codegraph index` dans la PR de chaque version mineure ou majeure.
// Mintlify fournit React et ses hooks sans import ; le snippet est autonome.

const CM_W = 1000;
const CM_H = 700;
const CM_DATA = {"locale":"en-US","version":"v0.8.1","date":"2026-11-26","commit":"04a4e00c","meta":"Version v0.8.1 of 2026-11-26, commit 04a4e00c","totals":"158 zones, 311,375 lines of code, 280 links shown","layers":{"apps":"Apps","plugins":"Plugins","crates":"Crates","packages":"Packages","autres":"Other"},"ui":{"title":"Codebase map","meta":"Version {version} of {date}, commit {commit}","totals":"{zones} zones, {lines} lines of code, {links} links shown","search":"Search a zone","zoomIn":"Zoom in","zoomOut":"Zoom out","reset":"Reset view","layers":"Layers","hint":"Scroll or use the buttons to zoom, drag to pan, click or press Enter on a zone for details.","lines":"lines of code","out":"Depends on","inc":"Used by","none":"No link above the threshold.","doc":"Documentation page","noDoc":"No user page cites this zone.","close":"Close","empty":"Click a zone to show its dependencies.","map":"Map of the codebase zones and their dependencies","results":"Results"}};
const CM_ZONES = [
  {"id":"apps/cli/src","couche":"apps","lignes":1169,"x":507,"y":518.2,"r":5,"doc":{"titre":"Install the CLI","href":"/en/installation"}},
  {"id":"apps/cli/src/commands","couche":"apps","lignes":2021,"x":496.3,"y":541.5,"r":6.6,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"apps/cli/src/mcp","couche":"apps","lignes":634,"x":545.2,"y":564.2,"r":3.7,"doc":{"titre":"MCP for agents","href":"/en/agents/mcp"}},
  {"id":"apps/desktop","couche":"apps","lignes":115,"x":203.9,"y":324.9,"r":3},
  {"id":"apps/desktop/plugins","couche":"apps","lignes":141,"x":188.6,"y":283.8,"r":3},
  {"id":"apps/desktop/scripts","couche":"apps","lignes":81,"x":251.4,"y":180.7,"r":3},
  {"id":"apps/desktop/src","couche":"apps","lignes":237,"x":382.6,"y":390.4,"r":3,"doc":{"titre":"Syntheo Desktop and the GDPR","href":"/en/conformite/rgpd"}},
  {"id":"apps/desktop/src-tauri","couche":"apps","lignes":4180,"x":612.5,"y":514.5,"r":9.5,"doc":{"titre":"Install the app","href":"/en/desktop-installation"}},
  {"id":"apps/desktop/src/ai","couche":"apps","lignes":1090,"x":404.7,"y":357.1,"r":4.9,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"apps/desktop/src/automations","couche":"apps","lignes":3865,"x":388.5,"y":286,"r":9.1,"doc":{"titre":"Automations","href":"/en/automations"}},
  {"id":"apps/desktop/src/changelog","couche":"apps","lignes":186,"x":190.8,"y":405.4,"r":3},
  {"id":"apps/desktop/src/chat","couche":"apps","lignes":13072,"x":355.8,"y":322.7,"r":16.7,"doc":{"titre":"Chat with your meetings","href":"/en/chat"}},
  {"id":"apps/desktop/src/composer","couche":"apps","lignes":336,"x":325.8,"y":289.5,"r":3,"doc":{"titre":"Chat with your meetings","href":"/en/chat"}},
  {"id":"apps/desktop/src/contacts","couche":"apps","lignes":3669,"x":388.7,"y":305.8,"r":8.9,"doc":{"titre":"Contacts","href":"/en/contacts"}},
  {"id":"apps/desktop/src/contexts","couche":"apps","lignes":246,"x":341.2,"y":392.7,"r":3},
  {"id":"apps/desktop/src/db","couche":"apps","lignes":195,"x":403.2,"y":313.7,"r":3},
  {"id":"apps/desktop/src/devtools-bar","couche":"apps","lignes":4200,"x":430.9,"y":260.6,"r":9.5},
  {"id":"apps/desktop/src/dictation","couche":"apps","lignes":638,"x":471.4,"y":353.3,"r":3.7,"doc":{"titre":"Dictate in other apps","href":"/en/dictation"}},
  {"id":"apps/desktop/src/edit","couche":"apps","lignes":207,"x":488.9,"y":237,"r":3},
  {"id":"apps/desktop/src/editor-bridge","couche":"apps","lignes":975,"x":415.6,"y":250.1,"r":4.6},
  {"id":"apps/desktop/src/folders","couche":"apps","lignes":5218,"x":410.8,"y":280,"r":10.6,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"apps/desktop/src/home","couche":"apps","lignes":1373,"x":413.3,"y":299.2,"r":5.4,"doc":{"titre":"Your first meeting","href":"/en/quickstart"}},
  {"id":"apps/desktop/src/i18n","couche":"apps","lignes":201,"x":335,"y":325.9,"r":3,"doc":{"titre":"Use multiple languages","href":"/en/languages"}},
  {"id":"apps/desktop/src/instruction","couche":"apps","lignes":179,"x":218.6,"y":250.4,"r":3},
  {"id":"apps/desktop/src/lock","couche":"apps","lignes":394,"x":458.8,"y":262.6,"r":3,"doc":{"titre":"Data and privacy","href":"/en/data-and-privacy"}},
  {"id":"apps/desktop/src/main","couche":"apps","lignes":1088,"x":404.4,"y":380.2,"r":4.9},
  {"id":"apps/desktop/src/meeting-float","couche":"apps","lignes":2931,"x":472.6,"y":333.4,"r":7.9,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"apps/desktop/src/mesure","couche":"apps","lignes":2135,"x":363.6,"y":354,"r":6.8},
  {"id":"apps/desktop/src/onboarding","couche":"apps","lignes":961,"x":467.6,"y":314.6,"r":4.6,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"apps/desktop/src/routes","couche":"apps","lignes":390,"x":429.2,"y":396.1,"r":3},
  {"id":"apps/desktop/src/search","couche":"apps","lignes":734,"x":370.2,"y":276,"r":4,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"apps/desktop/src/services","couche":"apps","lignes":3132,"x":418.8,"y":364.9,"r":8.2,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"apps/desktop/src/session","couche":"apps","lignes":24852,"x":444.4,"y":292.3,"r":23.1,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"apps/desktop/src/settings","couche":"apps","lignes":15325,"x":390.5,"y":334.6,"r":18.2,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"apps/desktop/src/shared","couche":"apps","lignes":6560,"x":421.3,"y":343.1,"r":11.9,"doc":{"titre":"Folders and projects","href":"/en/folders"}},
  {"id":"apps/desktop/src/sidebar","couche":"apps","lignes":2511,"x":385.4,"y":361.5,"r":7.3},
  {"id":"apps/desktop/src/store","couche":"apps","lignes":10490,"x":447.8,"y":332.1,"r":15,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"apps/desktop/src/stt","couche":"apps","lignes":15835,"x":450.1,"y":369.1,"r":18.5,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"apps/desktop/src/styles","couche":"apps","lignes":590,"x":183.6,"y":362,"r":3.6},
  {"id":"apps/desktop/src/templates","couche":"apps","lignes":5195,"x":369.4,"y":296.9,"r":10.6,"doc":{"titre":"Folders and projects","href":"/en/folders"}},
  {"id":"apps/desktop/src/types","couche":"apps","lignes":14,"x":434.5,"y":352.5,"r":3},
  {"id":"apps/speech/examples","couche":"apps","lignes":354,"x":661.6,"y":214.3,"r":3},
  {"id":"apps/speech/src","couche":"apps","lignes":2430,"x":660.8,"y":260.1,"r":7.2},
  {"id":"crates/aec","couche":"crates","lignes":925,"x":691.3,"y":321.8,"r":4.4,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/agent-access","couche":"crates","lignes":3311,"x":535.6,"y":476.4,"r":8.4,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"crates/askama-utils","couche":"crates","lignes":394,"x":626.3,"y":112,"r":3,"doc":{"titre":"Use multiple languages","href":"/en/languages"}},
  {"id":"crates/audacity","couche":"crates","lignes":332,"x":735.8,"y":310.2,"r":3},
  {"id":"crates/audio","couche":"crates","lignes":226,"x":683.3,"y":444.3,"r":3,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/audio-actual","couche":"crates","lignes":6443,"x":646.1,"y":414.5,"r":11.8,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/audio-device","couche":"crates","lignes":2523,"x":644.4,"y":502.6,"r":7.4,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/audio-interface","couche":"crates","lignes":19,"x":406.2,"y":50.2,"r":3},
  {"id":"crates/audio-mock","couche":"crates","lignes":391,"x":668.2,"y":91.2,"r":3},
  {"id":"crates/audio-snapshot","couche":"crates","lignes":279,"x":495.7,"y":631.4,"r":3},
  {"id":"crates/audio-sync","couche":"crates","lignes":1095,"x":694,"y":415.8,"r":4.9,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/audio-utils","couche":"crates","lignes":764,"x":658.3,"y":581.6,"r":4.1,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"crates/brand","couche":"crates","lignes":7,"x":538.9,"y":74.7,"r":3,"doc":{"titre":"Uninstall Syntheo","href":"/en/uninstall"}},
  {"id":"crates/bundle","couche":"crates","lignes":132,"x":731.8,"y":155,"r":3},
  {"id":"crates/cli-docs","couche":"crates","lignes":398,"x":631.5,"y":156.5,"r":3,"doc":{"titre":"CLI reference","href":"/en/reference/cli"}},
  {"id":"crates/data","couche":"crates","lignes":68,"x":444.5,"y":600.8,"r":3},
  {"id":"crates/db-app","couche":"crates","lignes":9518,"x":580.5,"y":545.9,"r":14.3,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/db-change","couche":"crates","lignes":182,"x":750,"y":550.3,"r":3},
  {"id":"crates/db-core","couche":"crates","lignes":261,"x":537,"y":512.1,"r":3,"doc":{"titre":"Data and privacy","href":"/en/data-and-privacy"}},
  {"id":"crates/db-execute","couche":"crates","lignes":552,"x":629.6,"y":550.1,"r":3.4},
  {"id":"crates/db-migrate","couche":"crates","lignes":614,"x":613.2,"y":471.9,"r":3.6},
  {"id":"crates/db-reactive","couche":"crates","lignes":1908,"x":516.3,"y":445.9,"r":6.4},
  {"id":"crates/detect","couche":"crates","lignes":11427,"x":571.1,"y":446.3,"r":15.7,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"crates/device-monitor","couche":"crates","lignes":1356,"x":568.8,"y":483.1,"r":5.4,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/dictation-ui-macos","couche":"crates","lignes":235,"x":712.4,"y":593.2,"r":3},
  {"id":"crates/export-core","couche":"crates","lignes":875,"x":480.8,"y":160.6,"r":4.3,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"crates/frontmatter","couche":"crates","lignes":395,"x":770.2,"y":183.7,"r":3},
  {"id":"crates/fs-format","couche":"crates","lignes":73,"x":648.8,"y":636.7,"r":3},
  {"id":"crates/fs-sync-core","couche":"crates","lignes":2682,"x":393.4,"y":492.5,"r":7.6,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/host","couche":"crates","lignes":42,"x":550.9,"y":368,"r":3},
  {"id":"crates/image-hash","couche":"crates","lignes":348,"x":554.8,"y":642,"r":3,"doc":{"titre":"Transcribe on this computer","href":"/en/on-device-transcription"}},
  {"id":"crates/intercept","couche":"crates","lignes":342,"x":458.6,"y":90.8,"r":3},
  {"id":"crates/language","couche":"crates","lignes":829,"x":647.4,"y":363.4,"r":4.2,"doc":{"titre":"Use multiple languages","href":"/en/languages"}},
  {"id":"crates/listener-core","couche":"crates","lignes":7936,"x":571.8,"y":311.1,"r":13,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/listener2-core","couche":"crates","lignes":2510,"x":601.1,"y":273.3,"r":7.3,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"crates/mesure","couche":"crates","lignes":4931,"x":699.8,"y":235.2,"r":10.3,"doc":{"titre":"Beta: measurement and transparency","href":"/en/beta"}},
  {"id":"crates/mp3","couche":"crates","lignes":369,"x":812.6,"y":324.6,"r":3,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"crates/notification","couche":"crates","lignes":418,"x":583.7,"y":90.7,"r":3,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"crates/notification-interface","couche":"crates","lignes":845,"x":736.3,"y":401,"r":4.2,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"crates/notification-linux","couche":"crates","lignes":929,"x":744.2,"y":449.7,"r":4.5,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"crates/notification-macos","couche":"crates","lignes":3014,"x":773.7,"y":394.9,"r":8.1},
  {"id":"crates/notification-windows","couche":"crates","lignes":2943,"x":689.6,"y":367.8,"r":7.9,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"crates/onnx","couche":"crates","lignes":37,"x":817.5,"y":372.8,"r":3},
  {"id":"crates/openai-transcription","couche":"crates","lignes":1385,"x":654.5,"y":334.1,"r":5.5,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"crates/overlay-kit","couche":"crates","lignes":2711,"x":724.2,"y":494.2,"r":7.6},
  {"id":"crates/owhisper-client","couche":"crates","lignes":5237,"x":611.7,"y":334.7,"r":10.6,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"crates/owhisper-interface","couche":"crates","lignes":639,"x":611,"y":301.7,"r":3.7,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"crates/pinned-fetch","couche":"crates","lignes":391,"x":502.7,"y":41.9,"r":3,"doc":{"titre":"Transcribe on this computer","href":"/en/on-device-transcription"}},
  {"id":"crates/resampler","couche":"crates","lignes":795,"x":290.3,"y":583.1,"r":4.1},
  {"id":"crates/shortcut-macos","couche":"crates","lignes":919,"x":458.2,"y":665.4,"r":4.4},
  {"id":"crates/specta-export","couche":"crates","lignes":76,"x":584.3,"y":149,"r":3},
  {"id":"crates/speech-host","couche":"crates","lignes":3522,"x":573.2,"y":350.4,"r":8.7,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"crates/speech-probe","couche":"crates","lignes":1078,"x":521,"y":675.2,"r":4.8,"doc":{"titre":"Transcribe on this computer","href":"/en/on-device-transcription"}},
  {"id":"crates/speech-sources","couche":"crates","lignes":168,"x":806.2,"y":268.7,"r":3,"doc":{"titre":"Transcribe on this computer","href":"/en/on-device-transcription"}},
  {"id":"crates/storage","couche":"crates","lignes":1918,"x":598.8,"y":659.7,"r":6.4,"doc":{"titre":"Uninstall Syntheo","href":"/en/uninstall"}},
  {"id":"crates/summary","couche":"crates","lignes":334,"x":784.9,"y":498.6,"r":3,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"crates/supervisor","couche":"crates","lignes":323,"x":726,"y":211.9,"r":3,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/tcc","couche":"crates","lignes":121,"x":708,"y":115.7,"r":3},
  {"id":"crates/template-app","couche":"crates","lignes":1186,"x":624.5,"y":59.1,"r":5,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"crates/tiptap","couche":"crates","lignes":4920,"x":566.1,"y":30.3,"r":10.3,"doc":{"titre":"CLI for agents","href":"/en/agents/cli"}},
  {"id":"crates/transcript","couche":"crates","lignes":5315,"x":563.3,"y":398.3,"r":10.7,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/transcription-core","couche":"crates","lignes":194,"x":589.8,"y":250.4,"r":3,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/user-error","couche":"crates","lignes":55,"x":779.4,"y":231.7,"r":3},
  {"id":"crates/vad","couche":"crates","lignes":113,"x":390.1,"y":567,"r":3},
  {"id":"crates/vad-masking","couche":"crates","lignes":423,"x":767.5,"y":300.3,"r":3,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"crates/whisper","couche":"crates","lignes":211,"x":678.8,"y":152.2,"r":3},
  {"id":"crates/ws-client","couche":"crates","lignes":1163,"x":667,"y":304.5,"r":5,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"design/refonte-the-vert","couche":"autres","lignes":291,"x":273.7,"y":145.1,"r":3},
  {"id":"docs","couche":"autres","lignes":77,"x":297.2,"y":106.2,"r":3,"doc":{"titre":"Syntheo skill","href":"/en/agents/skills"}},
  {"id":"eslint-plugin-syntheo.mjs","couche":"autres","lignes":171,"x":335.1,"y":126,"r":3},
  {"id":"packages/changelog","couche":"packages","lignes":322,"x":387,"y":214.8,"r":3},
  {"id":"packages/db","couche":"packages","lignes":50,"x":500.9,"y":100.6,"r":3,"doc":{"titre":"Data and privacy","href":"/en/data-and-privacy"}},
  {"id":"packages/db-react","couche":"packages","lignes":266,"x":384.3,"y":103,"r":3},
  {"id":"packages/db-runtime","couche":"packages","lignes":39,"x":412.3,"y":101.9,"r":3},
  {"id":"packages/db-tauri","couche":"packages","lignes":21,"x":347.9,"y":72.9,"r":3},
  {"id":"packages/design-system","couche":"packages","lignes":553,"x":345.1,"y":369.7,"r":3.4},
  {"id":"packages/editor","couche":"packages","lignes":12196,"x":390.2,"y":258.1,"r":16.2,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"packages/provider-validation","couche":"packages","lignes":309,"x":313.7,"y":339.9,"r":3,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"packages/store","couche":"packages","lignes":87,"x":334,"y":246.3,"r":3,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"packages/ui","couche":"packages","lignes":5008,"x":417.8,"y":317.3,"r":10.3},
  {"id":"packages/utils","couche":"packages","lignes":538,"x":400.6,"y":297,"r":3.4,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"plugins/contacts","couche":"plugins","lignes":1192,"x":519.1,"y":562.9,"r":5,"doc":{"titre":"Contacts","href":"/en/contacts"}},
  {"id":"plugins/db","couche":"plugins","lignes":955,"x":451.3,"y":407.4,"r":4.6,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"plugins/deeplink2","couche":"plugins","lignes":464,"x":398.4,"y":439.2,"r":3.1},
  {"id":"plugins/detect","couche":"plugins","lignes":1789,"x":513.9,"y":406.8,"r":6.2,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"plugins/dictation","couche":"plugins","lignes":1278,"x":641.8,"y":289.5,"r":5.2,"doc":{"titre":"Dictate in other apps","href":"/en/dictation"}},
  {"id":"plugins/dock","couche":"plugins","lignes":390,"x":325.8,"y":542.5,"r":3},
  {"id":"plugins/export","couche":"plugins","lignes":824,"x":467.7,"y":207.8,"r":4.2,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"plugins/fs-sync","couche":"plugins","lignes":880,"x":428.4,"y":474.1,"r":4.4,"doc":{"titre":"Import a recording","href":"/en/import-recordings"}},
  {"id":"plugins/icon","couche":"plugins","lignes":737,"x":346.3,"y":584.9,"r":4},
  {"id":"plugins/local-api","couche":"plugins","lignes":1621,"x":346.4,"y":218.9,"r":5.9,"doc":{"titre":"Automations","href":"/en/automations"}},
  {"id":"plugins/local-auth","couche":"plugins","lignes":264,"x":397.7,"y":609.2,"r":3},
  {"id":"plugins/mesure","couche":"plugins","lignes":655,"x":297.6,"y":380.8,"r":3.8},
  {"id":"plugins/misc","couche":"plugins","lignes":170,"x":287.9,"y":516.7,"r":3},
  {"id":"plugins/notification","couche":"plugins","lignes":258,"x":370.5,"y":431.9,"r":3,"doc":{"titre":"Automate capture","href":"/en/automatic-capture"}},
  {"id":"plugins/notify","couche":"plugins","lignes":540,"x":199.8,"y":465.6,"r":3.4},
  {"id":"plugins/opener2","couche":"plugins","lignes":443,"x":226.6,"y":511.4,"r":3.1},
  {"id":"plugins/permissions","couche":"plugins","lignes":2895,"x":683,"y":516.8,"r":7.9,"doc":{"titre":"Your first meeting","href":"/en/quickstart"}},
  {"id":"plugins/relay","couche":"plugins","lignes":1173,"x":252,"y":554.4,"r":5},
  {"id":"plugins/session","couche":"plugins","lignes":1411,"x":375.9,"y":650.7,"r":5.5,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"plugins/settings","couche":"plugins","lignes":344,"x":257.5,"y":477.5,"r":3,"doc":{"titre":"Data and privacy","href":"/en/data-and-privacy"}},
  {"id":"plugins/sfx","couche":"plugins","lignes":377,"x":808.2,"y":441.5,"r":3},
  {"id":"plugins/shortcut","couche":"plugins","lignes":772,"x":432.7,"y":653.9,"r":4.1,"doc":{"titre":"Dictate in other apps","href":"/en/dictation"}},
  {"id":"plugins/sidecar2","couche":"plugins","lignes":220,"x":227.4,"y":429.3,"r":3},
  {"id":"plugins/store2","couche":"plugins","lignes":1506,"x":634.4,"y":458.6,"r":5.7,"doc":{"titre":"Uninstall Syntheo","href":"/en/uninstall"}},
  {"id":"plugins/tantivy","couche":"plugins","lignes":1437,"x":613.7,"y":573.2,"r":5.5,"doc":{"titre":"Notes, summaries and transcripts","href":"/en/notes"}},
  {"id":"plugins/template","couche":"plugins","lignes":809,"x":485.2,"y":436.9,"r":4.2,"doc":{"titre":"Customize summaries","href":"/en/customize-summaries"}},
  {"id":"plugins/tracing","couche":"plugins","lignes":1191,"x":557.7,"y":254.8,"r":5,"doc":{"titre":"Data and privacy","href":"/en/data-and-privacy"}},
  {"id":"plugins/transcription","couche":"plugins","lignes":7311,"x":512.6,"y":364.6,"r":12.6,"doc":{"titre":"Set up transcription and AI","href":"/en/ai-setup"}},
  {"id":"plugins/tray","couche":"plugins","lignes":2264,"x":591,"y":410.2,"r":7},
  {"id":"plugins/windows","couche":"plugins","lignes":6640,"x":519.5,"y":304.9,"r":11.9,"doc":{"titre":"Record a meeting","href":"/en/meetings"}},
  {"id":"scripts","couche":"autres","lignes":2110,"x":323.1,"y":626.5,"r":6.7,"doc":{"titre":"Transcribe on this computer","href":"/en/on-device-transcription"}},
  {"id":"scripts/beta","couche":"autres","lignes":1204,"x":213.1,"y":204.7,"r":5.1,"doc":{"titre":"Beta: measurement and transparency","href":"/en/beta"}},
  {"id":"scripts/lib","couche":"autres","lignes":92,"x":456,"y":43.2,"r":3},
  {"id":"scripts/remediation","couche":"autres","lignes":1007,"x":544.3,"y":126.3,"r":4.7},
];
const CM_LINKS = [
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/stt","poids":381},
  {"source":"apps/desktop/src/session","cible":"packages/ui","poids":326},
  {"source":"apps/desktop/src/settings","cible":"packages/ui","poids":289},
  {"source":"crates/db-app","cible":"crates/db-core","poids":251},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/automations","poids":226},
  {"source":"apps/desktop/src/session","cible":"packages/utils","poids":201},
  {"source":"apps/desktop/src/stt","cible":"plugins/transcription","poids":172},
  {"source":"apps/desktop/src/templates","cible":"packages/ui","poids":171},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/store","poids":143},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/shared","poids":140},
  {"source":"apps/cli/src/commands","cible":"apps/cli/src","poids":134},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/store","poids":131},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/shared","poids":126},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/db","poids":123},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/stt","poids":121},
  {"source":"apps/desktop/src/shared","cible":"packages/ui","poids":120},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/session","poids":115},
  {"source":"crates/db-app","cible":"crates/db-execute","poids":108},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/db","poids":106},
  {"source":"apps/desktop/src/chat","cible":"packages/ui","poids":100},
  {"source":"apps/desktop/src/contacts","cible":"packages/ui","poids":96},
  {"source":"packages/ui","cible":"packages/utils","poids":93},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/session","poids":92},
  {"source":"apps/desktop/src/store","cible":"plugins/transcription","poids":92},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/stt","poids":86},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/shared","poids":81},
  {"source":"apps/desktop/src/session","cible":"packages/editor","poids":81},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/session","poids":79},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/templates","poids":75},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/store","poids":73},
  {"source":"apps/desktop/src/folders","cible":"packages/utils","poids":72},
  {"source":"apps/desktop/src/folders","cible":"packages/editor","poids":71},
  {"source":"apps/desktop/src/folders","cible":"packages/ui","poids":71},
  {"source":"apps/desktop/src/chat","cible":"packages/utils","poids":68},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/store","poids":62},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/session","poids":61},
  {"source":"apps/desktop/src/sidebar","cible":"packages/ui","poids":60},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/shared","poids":55},
  {"source":"apps/desktop/src/editor-bridge","cible":"packages/editor","poids":53},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/ai","poids":53},
  {"source":"apps/desktop/src/settings","cible":"packages/utils","poids":53},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/settings","poids":49},
  {"source":"crates/listener-core","cible":"crates/owhisper-client","poids":49},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/store","poids":47},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/db","poids":46},
  {"source":"crates/agent-access","cible":"crates/db-core","poids":46},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/shared","poids":45},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/stt","poids":44},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/session","poids":44},
  {"source":"packages/editor","cible":"packages/ui","poids":44},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/services","poids":42},
  {"source":"plugins/transcription","cible":"plugins/db","poids":40},
  {"source":"apps/desktop/src","cible":"apps/desktop/src/shared","poids":39},
  {"source":"apps/desktop/src/chat","cible":"packages/editor","poids":39},
  {"source":"apps/desktop/src/automations","cible":"apps/desktop/src/settings","poids":38},
  {"source":"apps/desktop/src/meeting-float","cible":"apps/desktop/src/stt","poids":38},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/shared","poids":38},
  {"source":"apps/desktop/src/ai","cible":"apps/desktop/src/store","poids":37},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/settings","poids":37},
  {"source":"plugins/permissions","cible":"crates/overlay-kit","poids":37},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/shared","poids":36},
  {"source":"apps/desktop/src/stt","cible":"packages/ui","poids":36},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/automations","poids":35},
  {"source":"apps/desktop/src/devtools-bar","cible":"packages/ui","poids":35},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/db","poids":34},
  {"source":"apps/desktop/src/meeting-float","cible":"apps/desktop/src/store","poids":33},
  {"source":"apps/desktop/src/settings","cible":"packages/provider-validation","poids":33},
  {"source":"crates/notification-windows","cible":"crates/notification-interface","poids":33},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/automations","poids":32},
  {"source":"apps/cli/src/commands","cible":"crates/db-core","poids":31},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/store","poids":31},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/db","poids":31},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/session","poids":31},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/settings","poids":31},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/shared","poids":31},
  {"source":"apps/desktop/src/templates","cible":"packages/utils","poids":31},
  {"source":"crates/owhisper-client","cible":"crates/owhisper-interface","poids":31},
  {"source":"plugins/contacts","cible":"crates/db-core","poids":31},
  {"source":"plugins/transcription","cible":"crates/listener-core","poids":31},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/db","poids":30},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/store","poids":30},
  {"source":"apps/desktop/src/mesure","cible":"packages/ui","poids":30},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/shared","poids":30},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/folders","poids":30},
  {"source":"crates/owhisper-client","cible":"crates/openai-transcription","poids":30},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/search","poids":29},
  {"source":"apps/desktop/src/contacts","cible":"apps/desktop/src/shared","poids":28},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/settings","poids":28},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/contacts","poids":28},
  {"source":"crates/audio-actual","cible":"plugins/store2","poids":28},
  {"source":"apps/desktop/src/home","cible":"packages/utils","poids":27},
  {"source":"apps/desktop/src/mesure","cible":"apps/desktop/src/db","poids":27},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/store","poids":27},
  {"source":"apps/desktop/src/contacts","cible":"apps/desktop/src/db","poids":26},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/shared","poids":26},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/store","poids":26},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/stt","poids":26},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/editor-bridge","poids":26},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/lock","poids":26},
  {"source":"crates/listener2-core","cible":"crates/owhisper-client","poids":26},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/stt","poids":25},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/sidebar","poids":25},
  {"source":"crates/audio-device","cible":"crates/db-migrate","poids":25},
  {"source":"crates/notification-linux","cible":"crates/notification-interface","poids":25},
  {"source":"plugins/transcription","cible":"crates/speech-host","poids":25},
  {"source":"apps/desktop/src-tauri","cible":"crates/db-core","poids":24},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/session","poids":24},
  {"source":"apps/desktop/src/shared","cible":"packages/utils","poids":24},
  {"source":"apps/desktop/src/composer","cible":"apps/desktop/src/chat","poids":23},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/devtools-bar","poids":23},
  {"source":"crates/mesure","cible":"apps/speech/src","poids":23},
  {"source":"apps/desktop/src/ai","cible":"apps/desktop/src/settings","poids":22},
  {"source":"apps/desktop/src/automations","cible":"packages/ui","poids":22},
  {"source":"apps/desktop/src/devtools-bar","cible":"packages/utils","poids":22},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/templates","poids":22},
  {"source":"apps/desktop/src/mesure","cible":"plugins/mesure","poids":22},
  {"source":"apps/desktop/src/services","cible":"packages/utils","poids":22},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/contacts","poids":22},
  {"source":"apps/desktop/src/session","cible":"plugins/windows","poids":22},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/store","poids":22},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/templates","poids":21},
  {"source":"apps/desktop/src/routes","cible":"apps/desktop/src/shared","poids":21},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/services","poids":21},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/services","poids":21},
  {"source":"crates/audio-actual","cible":"crates/owhisper-client","poids":21},
  {"source":"crates/speech-host","cible":"crates/owhisper-client","poids":21},
  {"source":"packages/editor","cible":"apps/desktop/src/automations","poids":21},
  {"source":"apps/desktop/src/meeting-float","cible":"packages/ui","poids":20},
  {"source":"apps/desktop/src/sidebar","cible":"packages/utils","poids":20},
  {"source":"crates/detect","cible":"crates/db-migrate","poids":20},
  {"source":"crates/transcription-core","cible":"crates/listener2-core","poids":20},
  {"source":"plugins/fs-sync","cible":"crates/fs-sync-core","poids":20},
  {"source":"apps/desktop/src/automations","cible":"apps/desktop/src/session","poids":19},
  {"source":"apps/desktop/src/chat","cible":"plugins/db","poids":19},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/types","poids":19},
  {"source":"packages/editor","cible":"packages/utils","poids":19},
  {"source":"apps/cli/src/mcp","cible":"crates/db-core","poids":18},
  {"source":"apps/desktop/src","cible":"apps/desktop/src/services","poids":18},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/search","poids":18},
  {"source":"apps/desktop/src/main","cible":"packages/ui","poids":18},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/settings","poids":18},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/settings","poids":18},
  {"source":"plugins/transcription","cible":"crates/db-reactive","poids":18},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/contexts","poids":17},
  {"source":"apps/desktop/src/contacts","cible":"packages/utils","poids":17},
  {"source":"apps/desktop/src/onboarding","cible":"apps/desktop/src/shared","poids":17},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/ai","poids":17},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/contacts","poids":17},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/dictation","poids":17},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/db","poids":17},
  {"source":"crates/audio-device","cible":"plugins/store2","poids":17},
  {"source":"crates/notification-macos","cible":"crates/notification-interface","poids":17},
  {"source":"plugins/template","cible":"crates/db-core","poids":17},
  {"source":"apps/desktop/src/meeting-float","cible":"plugins/windows","poids":16},
  {"source":"apps/desktop/src/onboarding","cible":"apps/desktop/src/session","poids":16},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/i18n","poids":16},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/services","poids":16},
  {"source":"crates/transcription-core","cible":"crates/listener-core","poids":16},
  {"source":"apps/desktop/src/automations","cible":"apps/desktop/src/shared","poids":15},
  {"source":"apps/desktop/src/edit","cible":"apps/desktop/src/session","poids":15},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/stt","poids":15},
  {"source":"apps/desktop/src/meeting-float","cible":"apps/desktop/src/shared","poids":15},
  {"source":"apps/desktop/src/routes","cible":"apps/desktop/src/main","poids":15},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/mesure","poids":15},
  {"source":"crates/audio-utils","cible":"crates/db-execute","poids":15},
  {"source":"crates/fs-sync-core","cible":"plugins/deeplink2","poids":15},
  {"source":"plugins/fs-sync","cible":"plugins/db","poids":15},
  {"source":"plugins/windows","cible":"crates/owhisper-client","poids":15},
  {"source":"apps/desktop/src-tauri","cible":"plugins/store2","poids":14},
  {"source":"apps/desktop/src/automations","cible":"plugins/local-api","poids":14},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/search","poids":14},
  {"source":"apps/desktop/src/dictation","cible":"apps/desktop/src/shared","poids":14},
  {"source":"apps/desktop/src/onboarding","cible":"packages/ui","poids":14},
  {"source":"apps/desktop/src/services","cible":"packages/ui","poids":14},
  {"source":"apps/desktop/src/services","cible":"plugins/transcription","poids":14},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/shared","poids":14},
  {"source":"apps/desktop/src/stt","cible":"plugins/detect","poids":14},
  {"source":"crates/db-reactive","cible":"crates/db-core","poids":14},
  {"source":"plugins/export","cible":"crates/export-core","poids":14},
  {"source":"apps/desktop/src/automations","cible":"apps/desktop/src/chat","poids":13},
  {"source":"apps/desktop/src/dictation","cible":"apps/desktop/src/stt","poids":13},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/folders","poids":13},
  {"source":"apps/desktop/src/templates","cible":"packages/store","poids":13},
  {"source":"crates/aec","cible":"crates/audacity","poids":13},
  {"source":"crates/audio-actual","cible":"crates/audio","poids":13},
  {"source":"crates/audio-device","cible":"crates/db-execute","poids":13},
  {"source":"crates/listener-core","cible":"crates/owhisper-interface","poids":13},
  {"source":"crates/owhisper-client","cible":"crates/language","poids":13},
  {"source":"packages/changelog","cible":"packages/utils","poids":13},
  {"source":"packages/editor","cible":"packages/store","poids":13},
  {"source":"plugins/transcription","cible":"crates/owhisper-client","poids":13},
  {"source":"apps/desktop/src","cible":"apps/desktop/src/settings","poids":12},
  {"source":"apps/desktop/src/devtools-bar","cible":"apps/desktop/src/editor-bridge","poids":12},
  {"source":"apps/desktop/src/devtools-bar","cible":"apps/desktop/src/store","poids":12},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/ai","poids":12},
  {"source":"apps/desktop/src/folders","cible":"apps/desktop/src/editor-bridge","poids":12},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/folders","poids":12},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/contexts","poids":12},
  {"source":"apps/desktop/src/meeting-float","cible":"apps/desktop/src/settings","poids":12},
  {"source":"apps/desktop/src/onboarding","cible":"apps/desktop/src/stt","poids":12},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/chat","poids":12},
  {"source":"apps/desktop/src/store","cible":"packages/editor","poids":12},
  {"source":"apps/desktop/src/store","cible":"plugins/template","poids":12},
  {"source":"crates/mesure","cible":"crates/supervisor","poids":12},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/ai","poids":11},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/contacts","poids":11},
  {"source":"apps/desktop/src/contacts","cible":"apps/desktop/src/store","poids":11},
  {"source":"apps/desktop/src/editor-bridge","cible":"apps/desktop/src/search","poids":11},
  {"source":"apps/desktop/src/editor-bridge","cible":"apps/desktop/src/shared","poids":11},
  {"source":"apps/desktop/src/services","cible":"apps/desktop/src/types","poids":11},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/i18n","poids":11},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/sidebar","poids":11},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/stt","poids":11},
  {"source":"apps/desktop/src/shared","cible":"packages/design-system","poids":11},
  {"source":"apps/desktop/src/store","cible":"plugins/windows","poids":11},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/ai","poids":11},
  {"source":"crates/audio-actual","cible":"crates/audio-sync","poids":11},
  {"source":"crates/notification-windows","cible":"crates/owhisper-client","poids":11},
  {"source":"crates/transcript","cible":"crates/owhisper-client","poids":11},
  {"source":"plugins/detect","cible":"crates/detect","poids":11},
  {"source":"plugins/dictation","cible":"crates/owhisper-client","poids":11},
  {"source":"plugins/shortcut","cible":"crates/shortcut-macos","poids":11},
  {"source":"plugins/tracing","cible":"crates/listener2-core","poids":11},
  {"source":"apps/cli/src","cible":"apps/cli/src/commands","poids":10},
  {"source":"apps/cli/src","cible":"crates/db-core","poids":10},
  {"source":"apps/desktop/src/chat","cible":"apps/desktop/src/settings","poids":10},
  {"source":"apps/desktop/src/composer","cible":"packages/utils","poids":10},
  {"source":"apps/desktop/src/devtools-bar","cible":"apps/desktop/src/settings","poids":10},
  {"source":"apps/desktop/src/home","cible":"apps/desktop/src/search","poids":10},
  {"source":"apps/desktop/src/onboarding","cible":"packages/utils","poids":10},
  {"source":"apps/desktop/src/routes","cible":"apps/desktop/src/stt","poids":10},
  {"source":"apps/desktop/src/search","cible":"packages/utils","poids":10},
  {"source":"apps/desktop/src/services","cible":"plugins/notification","poids":10},
  {"source":"apps/desktop/src/session","cible":"plugins/export","poids":10},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/mesure","poids":10},
  {"source":"apps/desktop/src/settings","cible":"packages/design-system","poids":10},
  {"source":"apps/desktop/src/sidebar","cible":"apps/desktop/src/services","poids":10},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/automations","poids":10},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/i18n","poids":10},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/settings","poids":10},
  {"source":"crates/notification-linux","cible":"crates/overlay-kit","poids":10},
  {"source":"crates/vad-masking","cible":"crates/audacity","poids":10},
  {"source":"plugins/transcription","cible":"crates/transcript","poids":10},
  {"source":"plugins/tray","cible":"plugins/store2","poids":10},
  {"source":"apps/desktop/src-tauri","cible":"plugins/tantivy","poids":9},
  {"source":"apps/desktop/src/ai","cible":"apps/desktop/src/services","poids":9},
  {"source":"apps/desktop/src/ai","cible":"apps/desktop/src/shared","poids":9},
  {"source":"apps/desktop/src/home","cible":"packages/ui","poids":9},
  {"source":"apps/desktop/src/meeting-float","cible":"apps/desktop/src/dictation","poids":9},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/chat","poids":9},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/types","poids":9},
  {"source":"apps/desktop/src/session","cible":"plugins/transcription","poids":9},
  {"source":"apps/desktop/src/settings","cible":"apps/desktop/src/lock","poids":9},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/db","poids":9},
  {"source":"apps/desktop/src/shared","cible":"apps/desktop/src/types","poids":9},
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/ai","poids":9},
  {"source":"crates/audio-actual","cible":"crates/db-migrate","poids":9},
  {"source":"plugins/db","cible":"crates/db-reactive","poids":9},
  {"source":"plugins/transcription","cible":"crates/host","poids":9},
  {"source":"apps/desktop/src-tauri","cible":"crates/db-migrate","poids":8},
  {"source":"apps/desktop/src-tauri","cible":"plugins/permissions","poids":8},
  {"source":"apps/desktop/src/main","cible":"apps/desktop/src/ai","poids":8},
  {"source":"apps/desktop/src/routes","cible":"apps/desktop/src/store","poids":8},
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/automations","poids":8},
  {"source":"apps/desktop/src/shared","cible":"plugins/deeplink2","poids":8},
  {"source":"apps/desktop/src/store","cible":"apps/desktop/src/types","poids":8},
  {"source":"apps/desktop/src/templates","cible":"apps/desktop/src/session","poids":8},
  {"source":"apps/speech/examples","cible":"apps/speech/src","poids":8},
  {"source":"crates/aec","cible":"crates/owhisper-client","poids":8},
  {"source":"crates/agent-access","cible":"apps/cli/src","poids":8},
  {"source":"crates/agent-access","cible":"crates/transcript","poids":8},
  {"source":"crates/db-reactive","cible":"crates/device-monitor","poids":8},
  {"source":"crates/device-monitor","cible":"crates/db-migrate","poids":8},
  {"source":"crates/owhisper-client","cible":"apps/speech/src","poids":8},
  {"source":"crates/owhisper-client","cible":"crates/ws-client","poids":8},
  {"source":"packages/db-react","cible":"packages/db-runtime","poids":8},
  {"source":"packages/editor","cible":"apps/desktop/src/store","poids":8},
  {"source":"plugins/transcription","cible":"plugins/detect","poids":8},
  {"source":"plugins/transcription","cible":"plugins/tray","poids":8},
  {"source":"plugins/windows","cible":"plugins/tracing","poids":8},
];

const CM_COLORS = {
  apps: "hsl(142 45% 42%)",
  plugins: "hsl(212 62% 54%)",
  crates: "hsl(28 78% 52%)",
  packages: "hsl(282 45% 58%)",
  autres: "hsl(95 6% 55%)",
};

const CM_CSS = `
.cm-root{--cm-bg:hsl(48 100% 99%);--cm-fg:hsl(100 8% 15%);--cm-muted:hsl(95 6% 36%);--cm-border:hsl(55 18% 87%);--cm-surface:hsl(53 22% 92%);--cm-ring:hsl(142 36% 30%);font-family:Geist,system-ui,sans-serif;color:var(--cm-fg);font-size:14px;line-height:1.5;margin:20px 0}
html.dark .cm-root{--cm-bg:hsl(103 10% 14%);--cm-fg:hsl(46 25% 90%);--cm-muted:hsl(86 8% 65%);--cm-border:hsl(105 7% 21%);--cm-surface:hsl(105 9% 18%);--cm-ring:hsl(142 34% 62%)}
.cm-root *{box-sizing:border-box}
.cm-root :is(button,input,a,g[tabindex],svg[tabindex]):focus-visible{outline:2px solid var(--cm-ring);outline-offset:2px}
.cm-head{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;margin-bottom:8px}
.cm-head strong{font-size:15px}
.cm-small{font-size:12px;color:var(--cm-muted)}
.cm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.cm-btn{border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:3px 10px;cursor:pointer;min-width:32px}
.cm-chip{display:inline-flex;gap:6px;align-items:center;font-size:13px;cursor:pointer;border:1px solid var(--cm-border);border-radius:999px;padding:2px 10px;background:var(--cm-bg)}
.cm-chip input{margin:0;accent-color:var(--cm-ring)}
.cm-dot{width:10px;height:10px;border-radius:999px;display:inline-block}
.cm-search{flex:1 1 180px;min-width:0;border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:4px 10px}
.cm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
@media (min-width:900px){.cm-grid{grid-template-columns:minmax(0,1fr) 260px}}
.cm-stage{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-surface);overflow:hidden;touch-action:none}
.cm-stage svg{display:block;width:100%;height:auto;cursor:grab;user-select:none}
.cm-panel{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-bg);padding:12px;min-width:0;font-size:13px}
.cm-panel h4{margin:0 0 2px;font-size:14px;font-weight:600;word-break:break-all}
.cm-panel h5{margin:10px 0 4px;font-size:12px;font-weight:600;color:var(--cm-muted);text-transform:uppercase;letter-spacing:.04em}
.cm-panel ul{list-style:none;margin:0;padding:0}
.cm-panel li{margin:0}
.cm-link{border:0;background:none;padding:2px 0;font:inherit;color:inherit;cursor:pointer;text-align:left;display:flex;gap:6px;width:100%;justify-content:space-between}
.cm-link span:first-child{word-break:break-all}
.cm-panel a{color:var(--cm-ring)}
.cm-results{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
`;

const cmShort = (id) => id.split("/").pop();
const cmFmt = (n) => n.toLocaleString(CM_DATA.locale).replace(/ | /g, " ");

export const CodeMap = () => {
  const T = CM_DATA.ui;
  const byId = useMemo(() => new Map(CM_ZONES.map((z) => [z.id, z])), []);
  const neighbours = useMemo(() => {
    const m = new Map(CM_ZONES.map((z) => [z.id, { out: [], inc: [] }]));
    for (const l of CM_LINKS) {
      m.get(l.source).out.push(l);
      m.get(l.cible).inc.push(l);
    }
    return m;
  }, []);
  const [layers, setLayers] = useState(() => Object.fromEntries(Object.keys(CM_COLORS).map((k) => [k, true])));
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef(null);
  const drag = useRef(null);
  const dragged = useRef(false);

  const visible = (id) => layers[byId.get(id).couche];
  const q = query.trim().toLowerCase();
  const matches = q ? CM_ZONES.filter((z) => visible(z.id) && z.id.toLowerCase().includes(q)) : [];
  const focus = hover ? hover : selected;
  const lit = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const l of neighbours.get(focus).out) s.add(l.cible);
    for (const l of neighbours.get(focus).inc) s.add(l.source);
    return s;
  }, [focus, neighbours]);

  const zoomAt = (factor, cx, cy) =>
    setView((v) => {
      const k = Math.min(8, Math.max(0.5, v.k * factor));
      const px = cx === undefined ? CM_W / 2 : cx;
      const py = cy === undefined ? CM_H / 2 : cy;
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * CM_W, y: ((e.clientY - rect.top) / rect.height) * CM_H };
  };

  useEffect(() => {
    const svg = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const p = toSvg(e);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    dragged.current = false;
    drag.current = { start: toSvg(e), view, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svgRef.current.setPointerCapture(d.id);
    d.moved = true;
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) {
      dragged.current = true;
      svgRef.current.releasePointerCapture(d.id);
    }
    if (d && !d.moved && !hover) setSelected(null);
  };
  const onKey = (e) => {
    const step = 40;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.target !== svgRef.current) return;
    if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(0.8);
    else if (moves[e.key]) setView((v) => ({ ...v, x: v.x + moves[e.key][0], y: v.y + moves[e.key][1] }));
    else return;
    e.preventDefault();
  };

  const select = (id) => {
    setSelected(id);
    const z = byId.get(id);
    setView((v) => ({ k: Math.max(v.k, 1.6), x: CM_W / 2 - z.x * Math.max(v.k, 1.6), y: CM_H / 2 - z.y * Math.max(v.k, 1.6) }));
  };

  const linkList = (list, key) => {
    const top = list.filter((l) => visible(l[key])).slice(0, 5);
    if (top.length === 0) return <p className="cm-small" style={{ margin: 0 }}>{T.none}</p>;
    return (
      <ul>
        {top.map((l) => (
          <li key={l[key]}>
            <button type="button" className="cm-link" onClick={() => select(l[key])}>
              <span><span className="cm-dot" style={{ background: CM_COLORS[byId.get(l[key]).couche], marginRight: 6 }} />{l[key]}</span>
              <span className="cm-small">{cmFmt(l.poids)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const sel = selected ? byId.get(selected) : null;
  const k = view.k;
  return (
    <div className="not-prose cm-root">
      <style>{CM_CSS}</style>
      <div className="cm-head">
        <strong>{T.title}</strong>
        <span className="cm-small">{CM_DATA.meta}</span>
        <span className="cm-small">{CM_DATA.totals}</span>
      </div>
      <div className="cm-bar">
        <input className="cm-search" type="search" aria-label={T.search} placeholder={T.search} value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches.length > 0) select(matches[0].id); }} />
        <button type="button" className="cm-btn" aria-label={T.zoomIn} title={T.zoomIn} onClick={() => zoomAt(1.25)}>+</button>
        <button type="button" className="cm-btn" aria-label={T.zoomOut} title={T.zoomOut} onClick={() => zoomAt(0.8)}>−</button>
        <button type="button" className="cm-btn" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{T.reset}</button>
      </div>
      <fieldset className="cm-bar" style={{ border: 0, padding: 0, margin: "0 0 8px" }}>
        <legend className="cm-small" style={{ float: "left", marginRight: 4 }}>{T.layers}</legend>
        {Object.keys(CM_COLORS).map((c) => (
          <label key={c} className="cm-chip">
            <input type="checkbox" checked={layers[c]} onChange={() => setLayers({ ...layers, [c]: !layers[c] })} />
            <span className="cm-dot" style={{ background: CM_COLORS[c] }} />
            {CM_DATA.layers[c]} ({CM_ZONES.filter((z) => z.couche === c).length})
          </label>
        ))}
      </fieldset>
      {matches.length > 0 ? (
        <div className="cm-results" aria-label={T.results}>
          {matches.slice(0, 8).map((z) => (
            <button key={z.id} type="button" className="cm-btn" onClick={() => select(z.id)}>{z.id}</button>
          ))}
        </div>
      ) : null}
      <div className="cm-grid">
        <div className="cm-stage">
          <svg ref={svgRef} viewBox={`0 0 ${CM_W} ${CM_H}`} role="group" aria-label={T.map} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKey}>
            <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
              {CM_LINKS.filter((l) => visible(l.source) && visible(l.cible)).map((l) => {
                const a = byId.get(l.source);
                const b = byId.get(l.cible);
                const on = focus ? l.source === focus || l.cible === focus : false;
                return (
                  <line key={l.source + ">" + l.cible} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={on ? CM_COLORS[(l.source === focus ? b : a).couche] : "currentColor"}
                    strokeOpacity={focus ? (on ? 0.85 : 0.04) : 0.12}
                    strokeWidth={(0.4 + Math.log2(l.poids) * 0.25) / Math.sqrt(k)} />
                );
              })}
              {CM_ZONES.filter((z) => visible(z.id)).map((z) => {
                const dim = (lit && !lit.has(z.id)) || (q && !z.id.toLowerCase().includes(q));
                const label = z.r * k > 14 || (lit && lit.has(z.id)) || z.id === selected;
                return (
                  <g key={z.id} tabIndex={0} role="button" aria-label={`${z.id}, ${cmFmt(z.lignes)} ${T.lines}`}
                    aria-pressed={z.id === selected} style={{ cursor: "pointer", opacity: dim ? 0.18 : 1 }}
                    onMouseEnter={() => setHover(z.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(z.id)} onBlur={() => setHover(null)}
                    onClick={() => { if (!dragged.current) setSelected(z.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(z.id); } }}>
                    <title>{`${z.id} · ${cmFmt(z.lignes)} ${T.lines}`}</title>
                    <circle cx={z.x} cy={z.y} r={z.r} fill={CM_COLORS[z.couche]} fillOpacity={0.85}
                      stroke={z.id === selected ? "currentColor" : "var(--cm-bg)"} strokeWidth={(z.id === selected ? 2.5 : 1) / k} />
                    {label ? (
                      <text x={z.x} y={z.y + z.r + 11 / k} textAnchor="middle" fontSize={11 / k} fill="currentColor"
                        stroke="var(--cm-surface)" strokeWidth={3 / k} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                        {cmShort(z.id)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <aside className="cm-panel" aria-live="polite">
          {sel ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <h4>{sel.id}</h4>
                <button type="button" className="cm-btn" aria-label={T.close} onClick={() => setSelected(null)}>×</button>
              </div>
              <div className="cm-small">
                <span className="cm-dot" style={{ background: CM_COLORS[sel.couche], marginRight: 6 }} />
                {CM_DATA.layers[sel.couche]} · {cmFmt(sel.lignes)} {T.lines}
              </div>
              <h5>{T.out}</h5>
              {linkList(neighbours.get(sel.id).out, "cible")}
              <h5>{T.inc}</h5>
              {linkList(neighbours.get(sel.id).inc, "source")}
              <h5>{T.doc}</h5>
              {sel.doc ? <a href={sel.doc.href}>{sel.doc.titre}</a> : <p className="cm-small" style={{ margin: 0 }}>{T.noDoc}</p>}
            </div>
          ) : (
            <p className="cm-small" style={{ margin: 0 }}>{T.empty}</p>
          )}
        </aside>
      </div>
      <p className="cm-small" style={{ margin: "8px 0 0" }}>{T.hint}</p>
    </div>
  );
};
