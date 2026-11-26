// Fichier généré par scripts/code-map.mjs depuis l'index CodeGraph : ne pas modifier.
// Carte interactive de la code base (issue 761). Relancer `node scripts/code-map.mjs`
// après `codegraph index`, en dernier dans la PR de chaque version mineure ou majeure.
// Mintlify fournit React et ses hooks sans import ; le snippet est autonome.

const CM_W = 1000;
const CM_H = 700;
const CM_DATA = {"locale":"fr-FR","version":"v0.8.1-3-g8d9e7f0c","date":"2026-11-26","commit":"8d9e7f0c","minPoids":8,"meta":"v0.8.1 + 3 commits, commit 8d9e7f0c du 2026-11-26","totals":"158 zones, 309 223 lignes de code, 280 liens affichés","layers":{"apps":"Applications","plugins":"Plugins","crates":"Crates","packages":"Paquets","autres":"Autres"},"ui":{"title":"Carte de la code base","search":"Rechercher une zone","zoomIn":"Zoomer","zoomOut":"Dézoomer","reset":"Recentrer","layers":"Couches","hint":"Ctrl ou ⌘ + molette, ou les boutons, pour zoomer ; glisser pour déplacer ; Tab puis les flèches pour parcourir les zones, clic ou Entrée pour le détail.","lines":"lignes de code","out":"Dépend de","inc":"Utilisée par","none":"Aucun lien au-dessus du seuil.","doc":"Page de la documentation","noDoc":"Aucune page utilisateur ne cite cette zone.","close":"Fermer","empty":"Cliquez sur une zone pour afficher ses dépendances.","map":"Carte des zones de la code base et de leurs dépendances","results":"Résultats"}};
const CM_CSS = ".cm-root{--cm-bg:hsl(48 100% 99%);--cm-fg:hsl(100 8% 15%);--cm-muted:hsl(95 6% 36%);--cm-border:hsl(55 18% 87%);--cm-surface:hsl(53 22% 92%);--cm-ring:hsl(142 36% 30%);--cm-apps:hsl(142 45% 34%);--cm-plugins:hsl(212 62% 46%);--cm-crates:hsl(28 78% 38%);--cm-packages:hsl(282 45% 52%);--cm-autres:hsl(95 6% 42%);font-family:Geist,system-ui,sans-serif;color:var(--cm-fg);font-size:14px;line-height:1.5;margin:20px 0}\nhtml.dark .cm-root{--cm-bg:hsl(103 10% 14%);--cm-fg:hsl(46 25% 90%);--cm-muted:hsl(86 8% 65%);--cm-border:hsl(105 7% 21%);--cm-surface:hsl(105 9% 18%);--cm-ring:hsl(142 34% 62%);--cm-apps:hsl(142 45% 44%);--cm-plugins:hsl(212 62% 59%);--cm-crates:hsl(28 78% 48%);--cm-packages:hsl(282 45% 64%);--cm-autres:hsl(95 6% 54%)}\n.cm-root *{box-sizing:border-box}\n.cm-root :is(button,input,a,g[tabindex],svg[tabindex]):focus-visible{outline:2px solid var(--cm-ring);outline-offset:2px}\n.cm-head{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;margin-bottom:8px}\n.cm-head strong{font-size:15px}\n.cm-small{font-size:12px;color:var(--cm-muted)}\n.cm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}\n.cm-btn{border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:3px 10px;cursor:pointer;min-width:32px}\n.cm-chip{display:inline-flex;gap:6px;align-items:center;font-size:13px;cursor:pointer;border:1px solid var(--cm-border);border-radius:999px;padding:2px 10px;background:var(--cm-bg)}\n.cm-chip input{margin:0;accent-color:var(--cm-ring)}\n.cm-dot{width:10px;height:10px;border-radius:999px;display:inline-block}\n.cm-search{flex:1 1 180px;min-width:0;border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:4px 10px}\n.cm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}\n@media (min-width:900px){.cm-grid{grid-template-columns:minmax(0,1fr) 260px}}\n.cm-stage{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-surface);overflow:hidden;touch-action:none}\n.cm-stage svg{display:block;width:100%;height:auto;cursor:grab;user-select:none}\n.cm-panel{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-bg);padding:12px;min-width:0;font-size:13px}\n.cm-panel h4{margin:0 0 2px;font-size:14px;font-weight:600;word-break:break-all}\n.cm-panel h5{margin:10px 0 4px;font-size:12px;font-weight:600;color:var(--cm-muted);text-transform:uppercase;letter-spacing:.04em}\n.cm-panel ul{list-style:none;margin:0;padding:0}\n.cm-panel li{margin:0}\n.cm-link{border:0;background:none;padding:2px 0;font:inherit;color:inherit;cursor:pointer;text-align:left;display:flex;gap:6px;width:100%;justify-content:space-between}\n.cm-link span:first-child{word-break:break-all}\n.cm-panel a{color:var(--cm-ring)}\n.cm-results{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}";
const CM_ZONES = [
  {"id":"apps/cli/src","couche":"apps","lignes":1169,"x":514.4,"y":534,"r":5,"doc":{"titre":"Installer la CLI","href":"/fr/installation"}},
  {"id":"apps/cli/src/commands","couche":"apps","lignes":2021,"x":511.5,"y":559.4,"r":6.6,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"apps/cli/src/mcp","couche":"apps","lignes":634,"x":535.8,"y":577.9,"r":3.7,"doc":{"titre":"MCP pour les agents","href":"/fr/agents/mcp"}},
  {"id":"apps/desktop","couche":"apps","lignes":115,"x":246.2,"y":152,"r":3},
  {"id":"apps/desktop/plugins","couche":"apps","lignes":141,"x":290.7,"y":159.7,"r":3},
  {"id":"apps/desktop/scripts","couche":"apps","lignes":81,"x":371.3,"y":80,"r":3},
  {"id":"apps/desktop/src","couche":"apps","lignes":237,"x":342.7,"y":368,"r":3},
  {"id":"apps/desktop/src-tauri","couche":"apps","lignes":4180,"x":631.1,"y":506.1,"r":9.6,"doc":{"titre":"Installer l'application","href":"/fr/desktop-installation"}},
  {"id":"apps/desktop/src/ai","couche":"apps","lignes":1090,"x":411.8,"y":323.3,"r":4.9,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"apps/desktop/src/automations","couche":"apps","lignes":3865,"x":348.1,"y":386.4,"r":9.2,"doc":{"titre":"Automatisations","href":"/fr/automations"}},
  {"id":"apps/desktop/src/changelog","couche":"apps","lignes":186,"x":205.6,"y":232.9,"r":3},
  {"id":"apps/desktop/src/chat","couche":"apps","lignes":13072,"x":388.8,"y":399.1,"r":16.9,"doc":{"titre":"Discuter avec vos réunions","href":"/fr/chat"}},
  {"id":"apps/desktop/src/composer","couche":"apps","lignes":336,"x":348.3,"y":413.8,"r":3,"doc":{"titre":"Discuter avec vos réunions","href":"/fr/chat"}},
  {"id":"apps/desktop/src/contacts","couche":"apps","lignes":3669,"x":420.2,"y":336.5,"r":8.9,"doc":{"titre":"Contacts","href":"/fr/contacts"}},
  {"id":"apps/desktop/src/contexts","couche":"apps","lignes":246,"x":416.3,"y":443.1,"r":3},
  {"id":"apps/desktop/src/db","couche":"apps","lignes":195,"x":375.3,"y":328.1,"r":3},
  {"id":"apps/desktop/src/devtools-bar","couche":"apps","lignes":4200,"x":423.4,"y":307,"r":9.6},
  {"id":"apps/desktop/src/dictation","couche":"apps","lignes":638,"x":450.6,"y":300.8,"r":3.7,"doc":{"titre":"Dicter dans d'autres applications","href":"/fr/dictation"}},
  {"id":"apps/desktop/src/edit","couche":"apps","lignes":207,"x":303.5,"y":399.5,"r":3},
  {"id":"apps/desktop/src/editor-bridge","couche":"apps","lignes":975,"x":362.6,"y":296.9,"r":4.6},
  {"id":"apps/desktop/src/folders","couche":"apps","lignes":5218,"x":362.2,"y":317.7,"r":10.7,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"apps/desktop/src/home","couche":"apps","lignes":1373,"x":366.5,"y":389.6,"r":5.5,"doc":{"titre":"Votre première réunion","href":"/fr/quickstart"}},
  {"id":"apps/desktop/src/i18n","couche":"apps","lignes":201,"x":342.3,"y":293.7,"r":3,"doc":{"titre":"Utiliser plusieurs langues","href":"/fr/languages"}},
  {"id":"apps/desktop/src/instruction","couche":"apps","lignes":179,"x":287.3,"y":112.1,"r":3},
  {"id":"apps/desktop/src/lock","couche":"apps","lignes":394,"x":312.3,"y":306.4,"r":3,"doc":{"titre":"Données et confidentialité","href":"/fr/data-and-privacy"}},
  {"id":"apps/desktop/src/main","couche":"apps","lignes":1088,"x":434.8,"y":388.3,"r":4.9},
  {"id":"apps/desktop/src/meeting-float","couche":"apps","lignes":2931,"x":456.7,"y":360.6,"r":8,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"apps/desktop/src/mesure","couche":"apps","lignes":2135,"x":371.4,"y":275,"r":6.8},
  {"id":"apps/desktop/src/onboarding","couche":"apps","lignes":961,"x":412.5,"y":291.3,"r":4.6,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"apps/desktop/src/routes","couche":"apps","lignes":390,"x":455.9,"y":385.1,"r":3},
  {"id":"apps/desktop/src/search","couche":"apps","lignes":734,"x":355.9,"y":333.1,"r":4,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"apps/desktop/src/services","couche":"apps","lignes":3132,"x":402.9,"y":376,"r":8.3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"apps/desktop/src/session","couche":"apps","lignes":24852,"x":369,"y":359.1,"r":23.3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"apps/desktop/src/settings","couche":"apps","lignes":15325,"x":390,"y":301.7,"r":18.3,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"apps/desktop/src/shared","couche":"apps","lignes":6560,"x":405.8,"y":354.1,"r":12,"doc":{"titre":"Dossiers et projets","href":"/fr/folders"}},
  {"id":"apps/desktop/src/sidebar","couche":"apps","lignes":2511,"x":416.2,"y":387.5,"r":7.4},
  {"id":"apps/desktop/src/store","couche":"apps","lignes":10490,"x":432,"y":366.5,"r":15.1,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"apps/desktop/src/stt","couche":"apps","lignes":15835,"x":449.4,"y":333.1,"r":18.6,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"apps/desktop/src/styles","couche":"apps","lignes":590,"x":231.1,"y":195.1,"r":3.6},
  {"id":"apps/desktop/src/templates","couche":"apps","lignes":5195,"x":334.4,"y":349.7,"r":10.7,"doc":{"titre":"Dossiers et projets","href":"/fr/folders"}},
  {"id":"apps/desktop/src/types","couche":"apps","lignes":14,"x":349.8,"y":339.3,"r":3},
  {"id":"apps/speech/examples","couche":"apps","lignes":354,"x":728.1,"y":327.7,"r":3},
  {"id":"apps/speech/src","couche":"apps","lignes":2430,"x":680.5,"y":321.2,"r":7.3},
  {"id":"crates/aec","couche":"crates","lignes":925,"x":630.7,"y":280.7,"r":4.5,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/agent-access","couche":"crates","lignes":3311,"x":533.6,"y":493.1,"r":8.5,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"crates/askama-utils","couche":"crates","lignes":394,"x":689.4,"y":134.7,"r":3,"doc":{"titre":"Utiliser plusieurs langues","href":"/fr/languages"}},
  {"id":"crates/audacity","couche":"crates","lignes":332,"x":650.6,"y":238.4,"r":3},
  {"id":"crates/audio","couche":"crates","lignes":226,"x":712.5,"y":426.4,"r":3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/audio-actual","couche":"crates","lignes":6443,"x":662.8,"y":408.4,"r":11.9,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/audio-device","couche":"crates","lignes":2523,"x":669.1,"y":481,"r":7.4,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/audio-interface","couche":"crates","lignes":19,"x":582.6,"y":130.6,"r":3},
  {"id":"crates/audio-mock","couche":"crates","lignes":391,"x":637.7,"y":59,"r":3},
  {"id":"crates/audio-snapshot","couche":"crates","lignes":279,"x":381,"y":594.4,"r":3},
  {"id":"crates/audio-sync","couche":"crates","lignes":1095,"x":715.8,"y":394.9,"r":4.9,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/audio-utils","couche":"crates","lignes":764,"x":711.7,"y":542.6,"r":4.1,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"crates/brand","couche":"crates","lignes":7,"x":533.3,"y":121.3,"r":3,"doc":{"titre":"Désinstaller Syntheo","href":"/fr/uninstall"}},
  {"id":"crates/bundle","couche":"crates","lignes":132,"x":785.9,"y":209.1,"r":3},
  {"id":"crates/cli-docs","couche":"crates","lignes":398,"x":549.1,"y":169.6,"r":3,"doc":{"titre":"Référence de la CLI","href":"/fr/reference/cli"}},
  {"id":"crates/data","couche":"crates","lignes":68,"x":470.8,"y":627.9,"r":3},
  {"id":"crates/db-app","couche":"crates","lignes":6590,"x":600.2,"y":539.4,"r":12,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/db-change","couche":"crates","lignes":182,"x":785.1,"y":390.9,"r":3},
  {"id":"crates/db-core","couche":"crates","lignes":261,"x":548.5,"y":520,"r":3,"doc":{"titre":"Données et confidentialité","href":"/fr/data-and-privacy"}},
  {"id":"crates/db-execute","couche":"crates","lignes":552,"x":659.2,"y":529.9,"r":3.5},
  {"id":"crates/db-migrate","couche":"crates","lignes":614,"x":631,"y":451.2,"r":3.7},
  {"id":"crates/db-reactive","couche":"crates","lignes":1908,"x":518.8,"y":457.8,"r":6.5},
  {"id":"crates/detect","couche":"crates","lignes":11427,"x":597.9,"y":405,"r":15.8,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"crates/device-monitor","couche":"crates","lignes":1356,"x":576.8,"y":475.3,"r":5.5,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/dictation-ui-macos","couche":"crates","lignes":235,"x":534.9,"y":655,"r":3},
  {"id":"crates/export-core","couche":"crates","lignes":875,"x":227.2,"y":386.8,"r":4.3,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"crates/frontmatter","couche":"crates","lignes":395,"x":815.5,"y":296.6,"r":3},
  {"id":"crates/fs-format","couche":"crates","lignes":73,"x":777.1,"y":511.7,"r":3},
  {"id":"crates/fs-sync-core","couche":"crates","lignes":2682,"x":392.9,"y":513.1,"r":7.6,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/host","couche":"crates","lignes":42,"x":524.3,"y":323.8,"r":3},
  {"id":"crates/image-hash","couche":"crates","lignes":348,"x":586.5,"y":659,"r":3,"doc":{"titre":"Transcrire sur ce poste","href":"/fr/on-device-transcription"}},
  {"id":"crates/intercept","couche":"crates","lignes":342,"x":336.4,"y":129.1,"r":3},
  {"id":"crates/language","couche":"crates","lignes":829,"x":658.1,"y":359.4,"r":4.3,"doc":{"titre":"Utiliser plusieurs langues","href":"/fr/languages"}},
  {"id":"crates/listener-core","couche":"crates","lignes":7936,"x":558.5,"y":328.9,"r":13.2,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/listener2-core","couche":"crates","lignes":2510,"x":580.4,"y":292.8,"r":7.4,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"crates/mesure","couche":"crates","lignes":4931,"x":716.2,"y":288,"r":10.4,"doc":{"titre":"Bêta : mesure et transparence","href":"/fr/beta"}},
  {"id":"crates/mp3","couche":"crates","lignes":369,"x":798.9,"y":253.5,"r":3,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"crates/notification","couche":"crates","lignes":418,"x":596.4,"y":85.7,"r":3,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"crates/notification-interface","couche":"crates","lignes":845,"x":628.5,"y":541.2,"r":4.3,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"crates/notification-linux","couche":"crates","lignes":929,"x":651.4,"y":588.5,"r":4.5,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"crates/notification-macos","couche":"crates","lignes":3014,"x":615.7,"y":593.6,"r":8.1},
  {"id":"crates/notification-windows","couche":"crates","lignes":2943,"x":609.7,"y":460,"r":8,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"crates/onnx","couche":"crates","lignes":37,"x":788.6,"y":332.3,"r":3},
  {"id":"crates/openai-transcription","couche":"crates","lignes":1385,"x":633.2,"y":368.5,"r":5.5,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"crates/overlay-kit","couche":"crates","lignes":2711,"x":686.7,"y":598.9,"r":7.7},
  {"id":"crates/owhisper-client","couche":"crates","lignes":5237,"x":594.8,"y":357.4,"r":10.7,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"crates/owhisper-interface","couche":"crates","lignes":639,"x":598,"y":321.1,"r":3.7,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"crates/pinned-fetch","couche":"crates","lignes":391,"x":584.1,"y":38.7,"r":3,"doc":{"titre":"Transcrire sur ce poste","href":"/fr/on-device-transcription"}},
  {"id":"crates/resampler","couche":"crates","lignes":795,"x":825.2,"y":363.4,"r":4.2},
  {"id":"crates/shortcut-macos","couche":"crates","lignes":919,"x":276.7,"y":576.3,"r":4.5},
  {"id":"crates/specta-export","couche":"crates","lignes":76,"x":648.8,"y":159.9,"r":3},
  {"id":"crates/speech-host","couche":"crates","lignes":3522,"x":556.1,"y":374.6,"r":8.8,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"crates/speech-probe","couche":"crates","lignes":1078,"x":496.4,"y":157.1,"r":4.8,"doc":{"titre":"Transcrire sur ce poste","href":"/fr/on-device-transcription"}},
  {"id":"crates/speech-sources","couche":"crates","lignes":168,"x":736.4,"y":216.3,"r":3,"doc":{"titre":"Transcrire sur ce poste","href":"/fr/on-device-transcription"}},
  {"id":"crates/storage","couche":"crates","lignes":1918,"x":488.9,"y":673.5,"r":6.5,"doc":{"titre":"Désinstaller Syntheo","href":"/fr/uninstall"}},
  {"id":"crates/summary","couche":"crates","lignes":334,"x":783.2,"y":464.2,"r":3,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"crates/supervisor","couche":"crates","lignes":323,"x":746.7,"y":268.6,"r":3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/tcc","couche":"crates","lignes":121,"x":678.5,"y":87.7,"r":3},
  {"id":"crates/template-app","couche":"crates","lignes":1186,"x":529.2,"y":25.1,"r":5.1,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"crates/tiptap","couche":"crates","lignes":4920,"x":738.3,"y":113.8,"r":10.4,"doc":{"titre":"CLI pour les agents","href":"/fr/agents/cli"}},
  {"id":"crates/transcript","couche":"crates","lignes":5315,"x":544.6,"y":417.6,"r":10.8,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/transcription-core","couche":"crates","lignes":194,"x":572.3,"y":267.7,"r":3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/user-error","couche":"crates","lignes":55,"x":634.9,"y":115.7,"r":3},
  {"id":"crates/vad","couche":"crates","lignes":113,"x":426.4,"y":607.1,"r":3},
  {"id":"crates/vad-masking","couche":"crates","lignes":423,"x":667,"y":208.6,"r":3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"crates/whisper","couche":"crates","lignes":211,"x":758,"y":168.3,"r":3},
  {"id":"crates/ws-client","couche":"crates","lignes":1163,"x":646.5,"y":332.1,"r":5,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"design/refonte-the-vert","couche":"autres","lignes":291,"x":396.6,"y":41.3,"r":3},
  {"id":"docs","couche":"autres","lignes":77,"x":500.2,"y":68.9,"r":3,"doc":{"titre":"Compétence Syntheo","href":"/fr/agents/skills"}},
  {"id":"eslint-plugin-syntheo.mjs","couche":"autres","lignes":171,"x":470.7,"y":27.8,"r":3},
  {"id":"packages/changelog","couche":"packages","lignes":322,"x":330.7,"y":260.7,"r":3},
  {"id":"packages/db","couche":"packages","lignes":50,"x":440.6,"y":139.8,"r":3,"doc":{"titre":"Données et confidentialité","href":"/fr/data-and-privacy"}},
  {"id":"packages/db-react","couche":"packages","lignes":266,"x":440.4,"y":63.7,"r":3},
  {"id":"packages/db-runtime","couche":"packages","lignes":39,"x":431.4,"y":89.1,"r":3},
  {"id":"packages/db-tauri","couche":"packages","lignes":21,"x":547.8,"y":76.7,"r":3},
  {"id":"packages/design-system","couche":"packages","lignes":553,"x":421.5,"y":266.8,"r":3.5},
  {"id":"packages/editor","couche":"packages","lignes":12196,"x":333.1,"y":320.9,"r":16.3,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"packages/provider-validation","couche":"packages","lignes":309,"x":397.8,"y":233.1,"r":3,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"packages/store","couche":"packages","lignes":87,"x":279.1,"y":325.7,"r":3,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"packages/ui","couche":"packages","lignes":5008,"x":396.7,"y":331.6,"r":10.4},
  {"id":"packages/utils","couche":"packages","lignes":538,"x":381.1,"y":333.3,"r":3.4,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"plugins/contacts","couche":"plugins","lignes":1192,"x":560.7,"y":566.1,"r":5.1,"doc":{"titre":"Contacts","href":"/fr/contacts"}},
  {"id":"plugins/db","couche":"plugins","lignes":955,"x":458,"y":442.2,"r":4.6,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"plugins/deeplink2","couche":"plugins","lignes":464,"x":389.7,"y":456.1,"r":3.2},
  {"id":"plugins/detect","couche":"plugins","lignes":1789,"x":525.9,"y":367.8,"r":6.3,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"plugins/dictation","couche":"plugins","lignes":1278,"x":629.7,"y":311.4,"r":5.3,"doc":{"titre":"Dicter dans d'autres applications","href":"/fr/dictation"}},
  {"id":"plugins/dock","couche":"plugins","lignes":390,"x":327.2,"y":617.7,"r":3},
  {"id":"plugins/export","couche":"plugins","lignes":824,"x":276.8,"y":376.5,"r":4.2,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"plugins/fs-sync","couche":"plugins","lignes":880,"x":431.6,"y":504.3,"r":4.4,"doc":{"titre":"Importer un enregistrement","href":"/fr/import-recordings"}},
  {"id":"plugins/icon","couche":"plugins","lignes":737,"x":334,"y":572.6,"r":4},
  {"id":"plugins/local-api","couche":"plugins","lignes":1621,"x":298.3,"y":439.7,"r":6,"doc":{"titre":"Automatisations","href":"/fr/automations"}},
  {"id":"plugins/local-auth","couche":"plugins","lignes":264,"x":709.3,"y":177,"r":3},
  {"id":"plugins/mesure","couche":"plugins","lignes":655,"x":352.9,"y":213.3,"r":3.8},
  {"id":"plugins/misc","couche":"plugins","lignes":170,"x":241.4,"y":523.3,"r":3},
  {"id":"plugins/notification","couche":"plugins","lignes":258,"x":362.4,"y":447.8,"r":3,"doc":{"titre":"Automatiser la capture","href":"/fr/automatic-capture"}},
  {"id":"plugins/notify","couche":"plugins","lignes":540,"x":174,"y":342.9,"r":3.4},
  {"id":"plugins/opener2","couche":"plugins","lignes":443,"x":214.4,"y":485.7,"r":3.1},
  {"id":"plugins/permissions","couche":"plugins","lignes":2895,"x":674.1,"y":560.3,"r":7.9,"doc":{"titre":"Votre première réunion","href":"/fr/quickstart"}},
  {"id":"plugins/relay","couche":"plugins","lignes":1173,"x":376.1,"y":644,"r":5.1},
  {"id":"plugins/session","couche":"plugins","lignes":1411,"x":428.2,"y":661,"r":5.5,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"plugins/settings","couche":"plugins","lignes":344,"x":187.2,"y":435.4,"r":3,"doc":{"titre":"Données et confidentialité","href":"/fr/data-and-privacy"}},
  {"id":"plugins/sfx","couche":"plugins","lignes":377,"x":810.5,"y":428.5,"r":3},
  {"id":"plugins/shortcut","couche":"plugins","lignes":772,"x":283.5,"y":547.8,"r":4.1,"doc":{"titre":"Dicter dans d'autres applications","href":"/fr/dictation"}},
  {"id":"plugins/sidecar2","couche":"plugins","lignes":220,"x":187.6,"y":280.9,"r":3},
  {"id":"plugins/store2","couche":"plugins","lignes":1506,"x":648.9,"y":452.6,"r":5.7,"doc":{"titre":"Désinstaller Syntheo","href":"/fr/uninstall"}},
  {"id":"plugins/tantivy","couche":"plugins","lignes":1437,"x":691.8,"y":507.8,"r":5.6,"doc":{"titre":"Notes, comptes rendus et transcriptions","href":"/fr/notes"}},
  {"id":"plugins/template","couche":"plugins","lignes":809,"x":485.6,"y":456.3,"r":4.2,"doc":{"titre":"Personnaliser les comptes rendus","href":"/fr/customize-summaries"}},
  {"id":"plugins/tracing","couche":"plugins","lignes":1191,"x":532.7,"y":278.6,"r":5.1,"doc":{"titre":"Données et confidentialité","href":"/fr/data-and-privacy"}},
  {"id":"plugins/transcription","couche":"plugins","lignes":7311,"x":494.9,"y":380.8,"r":12.7,"doc":{"titre":"Configurer la transcription et l'IA","href":"/fr/ai-setup"}},
  {"id":"plugins/tray","couche":"plugins","lignes":2264,"x":574.9,"y":430.6,"r":7},
  {"id":"plugins/windows","couche":"plugins","lignes":6640,"x":488.1,"y":338.1,"r":12,"doc":{"titre":"Enregistrer une réunion","href":"/fr/meetings"}},
  {"id":"scripts","couche":"autres","lignes":2886,"x":386.4,"y":125,"r":7.9,"doc":{"titre":"Transcrire sur ce poste","href":"/fr/on-device-transcription"}},
  {"id":"scripts/beta","couche":"autres","lignes":1204,"x":324.8,"y":74.2,"r":5.2,"doc":{"titre":"Bêta : mesure et transparence","href":"/fr/beta"}},
  {"id":"scripts/lib","couche":"autres","lignes":92,"x":482.1,"y":111.3,"r":3},
  {"id":"scripts/remediation","couche":"autres","lignes":1007,"x":602.4,"y":173.8,"r":4.7},
];
const CM_LINKS = [
  {"source":"apps/desktop/src/session","cible":"apps/desktop/src/stt","poids":381},
  {"source":"apps/desktop/src/session","cible":"packages/ui","poids":326},
  {"source":"apps/desktop/src/settings","cible":"packages/ui","poids":289},
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
  {"source":"apps/desktop/src/stt","cible":"apps/desktop/src/db","poids":106},
  {"source":"crates/db-app","cible":"crates/db-execute","poids":102},
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
  {"source":"crates/db-app","cible":"crates/db-core","poids":75},
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
  apps: "var(--cm-apps)",
  plugins: "var(--cm-plugins)",
  crates: "var(--cm-crates)",
  packages: "var(--cm-packages)",
  autres: "var(--cm-autres)",
};

const cmShort = (id) => id.split("/").pop();
const cmFmt = (n) => n.toLocaleString(CM_DATA.locale).replace(/[\u202f\u00a0]/g, "\u00a0");

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
  const [rover, setRover] = useState(null);
  const [ppu, setPpu] = useState(1);
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
    // Pixels par unité du viewBox : les étiquettes gardent 12 px à l'écran.
    const measure = () => {
      const w = svg.getBoundingClientRect().width;
      if (w > 0) setPpu(w / CM_W);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    // Molette seule : la page défile ; Ctrl ou ⌘ (et le pincement) zoome.
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = toSvg(e);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      svg.removeEventListener("wheel", onWheel);
    };
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

  // Tabulation itinérante : une seule zone dans l'ordre de tabulation, les
  // flèches mènent à la zone la plus proche dans leur direction.
  const shown = CM_ZONES.filter((z) => visible(z.id));
  const tabZone = rover && visible(rover) ? rover : shown.length > 0 ? shown[0].id : null;
  const focusZone = (id) => {
    setRover(id);
    const el = svgRef.current.querySelector('[data-id="' + id + '"]');
    if (el) el.focus();
  };
  const onZoneKey = (e, z) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(z.id);
      return;
    }
    const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    let next = null;
    if (e.key === "Home") next = shown[0];
    else if (e.key === "End") next = shown[shown.length - 1];
    else if (dirs[e.key]) {
      const [ux, uy] = dirs[e.key];
      let best = Infinity;
      for (const o of shown) {
        const along = (o.x - z.x) * ux + (o.y - z.y) * uy;
        if (o.id === z.id || along <= 0) continue;
        const score = along + 2 * Math.abs((o.x - z.x) * uy - (o.y - z.y) * ux);
        if (score < best) {
          best = score;
          next = o;
        }
      }
    } else return;
    e.preventDefault();
    if (next) focusZone(next.id);
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
  const px = k * ppu;
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
                const label = z.r * px > 11 || (lit && lit.has(z.id)) || z.id === selected;
                return (
                  <g key={z.id} data-id={z.id} tabIndex={z.id === tabZone ? 0 : -1} role="button" aria-label={`${z.id}, ${cmFmt(z.lignes)} ${T.lines}`}
                    aria-pressed={z.id === selected} style={{ cursor: "pointer", opacity: dim ? 0.18 : 1 }}
                    onMouseEnter={() => setHover(z.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => { setHover(z.id); setRover(z.id); }} onBlur={() => setHover(null)}
                    onClick={() => { if (!dragged.current) setSelected(z.id); }}
                    onKeyDown={(e) => onZoneKey(e, z)}>
                    <title>{`${z.id} · ${cmFmt(z.lignes)} ${T.lines}`}</title>
                    <circle cx={z.x} cy={z.y} r={z.r} fill={CM_COLORS[z.couche]} fillOpacity={0.85}
                      stroke={z.id === selected ? "currentColor" : "var(--cm-bg)"} strokeWidth={(z.id === selected ? 2.5 : 1) / k} />
                    {label ? (
                      <text x={z.x} y={z.y + z.r + 13 / px} textAnchor="middle" fontSize={12 / px} fill="currentColor"
                        stroke="var(--cm-surface)" strokeWidth={3 / px} paintOrder="stroke" style={{ pointerEvents: "none" }}>
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
