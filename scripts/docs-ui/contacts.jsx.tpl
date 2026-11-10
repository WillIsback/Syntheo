// <ContactsScreen> : la vue Contacts (contacts.mdx). Reproduit
// apps/desktop/src/sidebar/contacts.tsx et contacts/shared.tsx (tri,
// « Ajouter », recherche, vous en tête, épinglés, séparateur, puis
// organisations et personnes), contacts/person-item.tsx,
// new-person-form.tsx, details.tsx, details-sections.tsx (doublons,
// Résumé), details-fields.tsx, related-notes.tsx, contact-page-header.tsx et
// organization-details.tsx. Données d'exemple seulement.

const SYN_CSS_CONTACTS = `
.syn-ct{display:flex;height:580px;background:var(--syn-background)}
.syn-ct-side{flex:0 0 260px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:8px 8px}
.syn-ct-head{display:flex;align-items:center;justify-content:space-between;height:36px}
.syn-ct-search{display:flex;align-items:center;gap:8px;height:32px;border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-muted);padding:0 10px;color:var(--syn-muted-foreground)}
.syn-ct-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 13px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-ct-list{flex:1;min-height:0;overflow-y:auto}
.syn-ct-item{display:flex;align-items:center;gap:8px;width:100%;border-radius:8px;padding:8px 10px;font-size:14px;cursor:pointer}
.syn-ct-item:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent)}
.syn-ct-item[aria-current=true]{background:var(--syn-accent)}
.syn-ct-item .syn-ct-pin{opacity:0}
.syn-ct-item:hover .syn-ct-pin,.syn-ct-item .syn-ct-pin[aria-pressed=true],.syn-ct-pin:focus-visible{opacity:1}
.syn-ct-pin{display:grid;place-items:center;border:0;border-radius:3px;background:transparent;padding:4px;color:var(--syn-muted-foreground);cursor:pointer}
.syn-ct-pin[aria-pressed=true],.syn-ct-pinned{color:var(--syn-primary)}
.syn-ct-av{display:grid;place-items:center;flex-shrink:0;border-radius:999px;background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600}
.syn-ct-txt{flex:1;min-width:0}
.syn-ct-txt span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-ct-divider{height:1px;margin:4px 12px;background:var(--syn-accent)}
.syn-ct-new{display:flex;align-items:center;gap:6px;margin:4px 6px;border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-card);padding:4px 4px 4px 10px}
.syn-ct-new input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 13px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-ct-main{flex:1;min-width:0;display:flex;flex-direction:column}
.syn-ct-top{display:flex;align-items:center;justify-content:space-between;height:46px;padding:0 6px 0 16px}
.syn-ct-top h2{margin:0;font-size:14px;font-weight:600}
.syn-ct-scroll{flex:1;overflow-y:auto}
.syn-ct-dup{border-bottom:1px solid var(--syn-border);background:var(--syn-alert);color:var(--syn-alert-foreground);padding:14px 24px}
.syn-ct-dup h4{margin:0 0 4px;font-size:14px;font-weight:600}
.syn-ct-dup p{margin:0 0 10px;font-size:14px}
.syn-ct-duprow{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--syn-border);border-radius:6px;background:var(--syn-muted);padding:8px;color:var(--syn-foreground)}
.syn-ct-field{display:flex;align-items:center;min-height:46px;border-bottom:1px solid var(--syn-border);padding:6px 16px}
.syn-ct-field>span:first-child{flex:0 0 112px;font-size:14px;color:var(--syn-muted-foreground)}
.syn-ct-field input{flex:1;min-width:0;border:0;background:transparent;padding:4px 0;color:var(--syn-foreground);font:400 15px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-ct-field input::placeholder{color:var(--syn-faint)}
.syn-ct-sec{border-bottom:1px solid var(--syn-border);padding:20px 24px}
.syn-ct-sec h3{margin:0;font-size:14px;font-weight:500;color:var(--syn-muted-foreground)}
.syn-ct-box{border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-muted);padding:14px 16px}
.syn-ct-box ul{margin:0;padding-left:20px;font-size:14px;line-height:1.6}
.syn-ct-notes{margin:0;padding:0;list-style:none}
.syn-ct-notes button{display:flex;align-items:center;gap:12px;width:100%;border:0;border-radius:6px;background:transparent;padding:8px;color:var(--syn-foreground);font:400 14px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-ct-notes button:hover{background:var(--syn-accent)}
.syn-ct-status{border-top:1px solid var(--syn-border);padding:6px 16px;min-height:30px;font-size:12px;color:var(--syn-muted-foreground)}
`;

const SYN_CT_NOTES = {
  s1: ["Revue sprint 14", "2026-11-04"],
  s2: ["Point hebdo produit", "2026-10-28"],
  s3: ["Comité de pilotage Acme", "2026-11-03"],
  s4: ["Revue sprint 13", "2026-10-14"],
  s6: ["Point projet Acme", "2026-10-20"],
  s7: ["Lancement client Acme", "2026-09-15"],
  s8: ["Découverte Biotech Nord", "2026-10-29"],
};
const synCtPerson = (id, name, email, jobTitle, org, sessions, extra = {}) => ({ id, name, email, emails: [], jobTitle, org, phone: "", linkedin: "", memo: "", pinned: false, sessions, order: 0, ...extra });
const synCtInitial = () => ({
  selected: { type: "person", id: "malik" },
  search: "",
  sort: "alphabetical",
  adding: false,
  created: 0,
  status: "",
  people: [
    synCtPerson("me", "Claire Dubois", "claire.dubois@exemple.fr", "Cheffe de produit", "Syntheo", ["s1", "s2", "s4"], { self: true, order: 1 }),
    synCtPerson("camille", "Camille Roux", "camille.roux@exemple.fr", "Développeuse", "Syntheo", ["s1", "s2", "s4"], { pinned: true, phone: "06 12 34 56 78", memo: "Préfère les points le matin.", order: 2 }),
    synCtPerson("malik", "Malik Benali", "malik.benali@acme.example", "Responsable technique", "Acme", ["s1", "s3", "s6"], { order: 3 }),
    synCtPerson("malik2", "Malik Benali", "m.benali@exemple.org", "", "", ["s7"], { order: 4 }),
    synCtPerson("lea", "Léa Martin", "lea.martin@biotech-nord.example", "Responsable qualité", "Biotech Nord", ["s8"], { order: 5 }),
    synCtPerson("thomas", "Thomas Petit", "", "", "", [], { order: 6 }),
  ],
  orgs: [{ id: "acme", name: "Acme" }, { id: "biotech", name: "Biotech Nord" }],
});
// Faits du « Résumé » : générés par le modèle de langage dans l'app.
const SYN_CT_FACTS = {
  malik: ["Responsable technique chez Acme, interlocuteur pour la mise en production.", "Suit le quota du serveur de transcription.", "A validé la reprise des données en octobre."],
  camille: ["Développeuse sur l'import des factures.", "Prévient les testeurs de la bêta.", "Préfère les points le matin."],
  me: ["Anime les revues de sprint.", "Prépare la bêta du 21 novembre.", "Suit le déploiement chez Acme."],
  lea: ["Responsable qualité chez Biotech Nord.", "Cherche à automatiser les comptes rendus de comités qualité.", "Attend une démonstration en novembre."],
};

const synCtInitials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const synCtEmails = (p) => [p.email, ...p.emails].map((e) => e.trim().toLowerCase()).filter(Boolean);
const synCtDuplicates = (person, people) =>
  person.self
    ? []
    : people.filter((c) => c.id !== person.id && !c.self && (synCtEmails(c).some((e) => synCtEmails(person).includes(e)) || (person.name.trim() !== "" && c.name.trim().toLowerCase() === person.name.trim().toLowerCase())));

const SynCtAvatar = ({ name, size = 32, org }) =>
  org ? (
    <span className="syn-ct-av" aria-hidden="true" style={{ width: size, height: size, background: "var(--syn-muted)", color: "var(--syn-muted-foreground)" }}>
      {h(SynIcon, { name: I("Buildings"), size: size / 2 })}
    </span>
  ) : (
    <span className="syn-ct-av" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{synCtInitials(name)}</span>
  );

const SynCtItem = ({ label, sub, active, onClick, pinned, onTogglePin, readOnly, org }) => (
  <div
    role="button"
    tabIndex={0}
    className="syn-ct-item"
    aria-current={active}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    }}
  >
    {h(SynCtAvatar, { name: label, org })}
    <span className="syn-ct-txt">
      <span style={{ fontWeight: 500 }}>{label}</span>
      {sub ? <span className="syn-muted syn-small">{sub}</span> : null}
    </span>
    {readOnly ? (
      <span role="img" aria-label="Contact épinglé" className="syn-ct-pinned" style={{ display: "flex", padding: 4 }}>{h(SynIcon, { name: I("PushPin"), size: 14 })}</span>
    ) : (
      <button
        type="button"
        className="syn-ct-pin"
        aria-pressed={pinned}
        aria-label={pinned ? "Détacher le contact" : "Épingler le contact"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
      >
        {h(SynIcon, { name: I("PushPin"), size: 14 })}
      </button>
    )}
  </div>
);

const SynCtField = ({ label, value, onChange, placeholder, type = "text", children }) => (
  <div className="syn-ct-field">
    <span>{label}</span>
    {children ?? <input type={type} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />}
  </div>
);

const SynCtPerson = ({ person, state, patch, update, markers }) => {
  const [addingEmail, setAddingEmail] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [newest, setNewest] = useState(true);
  const dups = synCtDuplicates(person, state.people);
  const set = (key) => (value) => update(person.id, { [key]: value });
  const merge = (dup) => {
    const merged = {
      ...person,
      emails: [...person.emails, ...synCtEmails(dup).filter((e) => !synCtEmails(person).includes(e))],
      jobTitle: person.jobTitle || dup.jobTitle,
      org: person.org || dup.org,
      sessions: [...person.sessions, ...dup.sessions.filter((s) => !person.sessions.includes(s))],
    };
    patch({ people: state.people.filter((c) => c.id !== dup.id).map((c) => (c.id === person.id ? merged : c)), status: `Contacts fusionnés : notes associées réunies, ${dup.email} conservée comme adresse supplémentaire.` });
  };
  const q = noteSearch.trim().toLowerCase();
  const notes = person.sessions
    .map((id) => ({ id, title: SYN_CT_NOTES[id][0], iso: SYN_CT_NOTES[id][1] }))
    .filter((n) => !q || n.title.toLowerCase().includes(q))
    .sort((a, b) => (newest ? (a.iso < b.iso ? 1 : -1) : a.iso > b.iso ? 1 : -1));
  const readOnly = Boolean(person.self);
  const rows = [
    [L("Name"), "name", L("Name")],
    [L("Job Title"), "jobTitle", L("Software Engineer")],
  ];
  return (
    <>
      <div className="syn-ct-top">
        <h2>{person.name || person.email || L("Unnamed")}</h2>
        {readOnly
          ? null
          : h(SynMenuButton, {
              label: L("Contact options"),
              items: [
                { icon: I("PushPin"), label: person.pinned ? L("Unpin") : L("Pin"), onSelect: () => update(person.id, { pinned: !person.pinned }) },
                { separator: true },
                { icon: I("Trash"), label: L("Delete"), onSelect: () => patch({ people: state.people.filter((c) => c.id !== person.id), selected: { type: "person", id: "me" } }) },
              ],
            })}
      </div>
      <div className="syn-ct-scroll">
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 20px" }}>
          <button type="button" aria-label={L("Change photo")} style={{ border: 0, background: "none", padding: 0, borderRadius: 999, cursor: "pointer" }}>
            {h(SynCtAvatar, { name: person.name, size: 64 })}
          </button>
        </div>
        {dups.length > 0 ? (
          <div className="syn-ct-dup" style={{ position: "relative" }}>
            {markers ? h(SynHotspot, { n: 2, style: { left: 4, top: 14 } }) : null}
            <h4>{L("Duplicate contact found")}</h4>
            <p>{L("Another contact shares the same name or email. Merge them to consolidate all related notes and information.")}</p>
            {dups.map((dup) => (
              <div key={dup.id} className="syn-ct-duprow">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {h(SynCtAvatar, { name: dup.name })}
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{dup.name || L("Unnamed contact")}</span>
                    <span className="syn-muted syn-small">{dup.email}</span>
                  </span>
                </span>
                <button type="button" className="syn-ui-btn" data-variant="primary" onClick={() => merge(dup)}>{L("Merge")}</button>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ position: "relative" }}>
          {markers ? h(SynHotspot, { n: 3, style: { right: 12, top: 12 } }) : null}
          {readOnly ? (
            [[L("Name"), person.name], [L("Job Title"), person.jobTitle], [L("Company"), person.org], [L("Email"), synCtEmails(person).join("\n")], [L("Phone"), person.phone], [L("LinkedIn"), person.linkedin], [L("Notes"), person.memo]].map(([label, value]) =>
              h(SynCtField, { key: label, label }, <span style={{ flex: 1, fontSize: 15, whiteSpace: "pre-wrap" }}>{value}</span>),
            )
          ) : (
            <>
              {rows.map(([label, key, placeholder]) => h(SynCtField, { key, label, value: person[key], onChange: set(key), placeholder }))}
              {h(
                SynCtField,
                { label: L("Company") },
                person.org ? (
                  <span style={{ flex: 1, fontSize: 15 }}>{person.org}</span>
                ) : (
                  <button type="button" className="syn-ui-btn" data-variant="ghost" style={{ marginLeft: -10, color: "var(--syn-muted-foreground)" }}>
                    {h(SynIcon, { name: I("Plus"), size: 14 })}
                    {L("Add organization")}
                  </button>
                ),
              )}
              {h(SynCtField, { label: L("Email"), type: "email", value: person.email, onChange: set("email"), placeholder: "john@example.com" })}
              {person.emails.map((email) =>
                h(
                  SynCtField,
                  { key: email, label: "" },
                  <>
                    <input type="email" aria-label={L("Email")} placeholder="jane@example.com" value={email} readOnly />
                    <button type="button" className="syn-icon-btn" aria-label={L("Remove email")} onClick={() => update(person.id, { emails: person.emails.filter((e) => e !== email) })}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
                  </>,
                ),
              )}
              {h(
                SynCtField,
                { label: "" },
                addingEmail ? (
                  <input
                    type="email"
                    autoFocus
                    aria-label={L("Email")}
                    placeholder="jane@example.com"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      setAddingEmail(false);
                      if (value) update(person.id, { emails: [...person.emails, value] });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                ) : (
                  <button type="button" className="syn-ui-btn" data-variant="ghost" style={{ marginLeft: -10, minHeight: 28, color: "var(--syn-muted-foreground)" }} onClick={() => setAddingEmail(true)}>
                    {L("Add email")}
                  </button>
                ),
              )}
              {h(SynCtField, { label: L("Phone"), type: "tel", value: person.phone, onChange: set("phone"), placeholder: "+1 (555) 123-4567" })}
              {h(SynCtField, { label: L("LinkedIn"), value: person.linkedin, onChange: set("linkedin"), placeholder: "https://www.linkedin.com/in/johntopia/" })}
              {h(SynCtField, { label: L("Notes"), value: person.memo, onChange: set("memo"), placeholder: L("Add notes about this contact...") })}
            </>
          )}
        </div>
        {person.sessions.length > 0 ? (
          <div className="syn-ct-sec" style={{ position: "relative" }}>
            {markers ? h(SynHotspot, { n: 4, style: { left: 4, top: 20 } }) : null}
            <h3 style={{ marginBottom: 12 }}>{L("Summary")}</h3>
            <div className="syn-ct-box">
              <ul>{(SYN_CT_FACTS[person.id] ?? [`Participe à « ${SYN_CT_NOTES[person.sessions[0]][0]} ».`]).map((fact) => <li key={fact}>{fact}</li>)}</ul>
            </div>
          </div>
        ) : null}
        <div className="syn-ct-sec" style={{ borderBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h3 style={{ flex: 1 }}>{L("Related Notes")}</h3>
            {person.sessions.length > 1
              ? h(SynMenuButton, {
                  label: L("Sort options"),
                  icon: I("ArrowsDownUp"),
                  items: [
                    { label: L("Newest"), icon: newest ? I("Check") : undefined, onSelect: () => setNewest(true) },
                    { label: L("Oldest"), icon: newest ? undefined : I("Check"), onSelect: () => setNewest(false) },
                  ],
                })
              : null}
            <label className="syn-ct-search" style={{ width: 180 }}>
              {h(SynIcon, { name: I("MagnifyingGlass"), size: 14 })}
              <input type="text" aria-label={L("Search...")} placeholder={L("Search...")} value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} />
            </label>
          </div>
          {notes.length > 0 ? (
            <ul className="syn-ct-notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => patch({ status: `La note « ${n.title} » s'ouvre.` })}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--syn-muted-foreground)" }} />
                    <span style={{ flex: 1 }}>{n.title}</span>
                    <time className="syn-muted syn-small">{n.iso.split("-").reverse().join("/")}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="syn-muted" style={{ margin: 0, padding: 8, fontSize: 14 }}>{q ? L("No results found.") : L("No related notes found")}</p>
          )}
        </div>
      </div>
    </>
  );
};

const SynCtOrg = ({ org, state, patch }) => {
  const members = state.people.filter((p) => p.org === org.name);
  return (
    <>
      <div className="syn-ct-top">
        <h2>{org.name || L("Unnamed")}</h2>
        {h(SynMenuButton, { label: L("Contact options"), items: [{ icon: I("PushPin"), label: L("Pin") }, { separator: true }, { icon: I("Trash"), label: L("Delete") }] })}
      </div>
      <div className="syn-ct-scroll">
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 20px" }}>
          <button type="button" aria-label={L("Change photo")} style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}>{h(SynCtAvatar, { name: org.name, size: 64, org: true })}</button>
        </div>
        {h(SynCtField, { label: L("Name"), value: org.name, placeholder: L("Organization name"), onChange: (name) => patch({ orgs: state.orgs.map((o) => (o.id === org.id ? { ...o, name } : o)) }) })}
        <div className="syn-ct-sec" style={{ borderBottom: 0 }}>
          <h3 style={{ marginBottom: 14 }}>
            {L("People")} <span style={{ fontWeight: 400 }}>· {members.length} {members.length === 1 ? L("member") : L("members")}</span>
          </h3>
          {members.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {members.map((m) => (
                <button key={m.id} type="button" className="syn-ui-btn" style={{ flexDirection: "column", padding: 12 }} onClick={() => patch({ selected: { type: "person", id: m.id } })}>
                  {h(SynCtAvatar, { name: m.name })}
                  <span>{m.name}</span>
                  <span className="syn-muted syn-small" style={{ fontWeight: 400 }}>{m.jobTitle}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="syn-muted" style={{ margin: 0, fontSize: 14 }}>{L("No people in this organization")}</p>
          )}
        </div>
      </div>
    </>
  );
};

/**
 * Vue Contacts, fiche de Malik Benali ouverte (un doublon à fusionner).
 * Repères : 1 liste (tri, « Ajouter », recherche), 2 doublon, 3 champs de la
 * fiche, 4 « Résumé » puis « Notes associées ».
 */
export const ContactsScreen = ({ markers = true }) => {
  const [state, setState] = useState(synCtInitial);
  const [showMarkers, setShowMarkers] = useState(markers);
  const newRef = useRef(null);
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const update = (id, p) => setState((s) => ({ ...s, people: s.people.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const q = state.search.trim().toLowerCase();
  const compare = (a, b) =>
    state.sort === "alphabetical" ? a.name.localeCompare(b.name, SYN_LOCALE) : state.sort === "reverse-alphabetical" ? b.name.localeCompare(a.name, SYN_LOCALE) : state.sort === "newest" ? b.order - a.order : a.order - b.order;
  const people = state.people.filter((p) => !p.self && (!q || `${p.name} ${p.email}`.toLowerCase().includes(q))).sort(compare);
  const orgs = state.orgs.filter((o) => !q || o.name.toLowerCase().includes(q));
  const self = state.people.find((p) => p.self);
  const pinned = people.filter((p) => p.pinned);
  const isActive = (type, id) => state.selected?.type === type && state.selected.id === id;
  const pick = (type, id) => patch({ selected: { type, id }, status: "" });
  const person = state.selected?.type === "person" ? state.people.find((p) => p.id === state.selected.id) : null;
  const org = state.selected?.type === "organization" ? state.orgs.find((o) => o.id === state.selected.id) : null;
  const personItem = (p) => h(SynCtItem, { key: p.id, label: p.name || p.email || L("Unnamed"), sub: p.name && p.email ? p.email : "", active: isActive("person", p.id), onClick: () => pick("person", p.id), pinned: p.pinned, onTogglePin: () => update(p.id, { pinned: !p.pinned }) });
  const addPerson = (name) => {
    const id = `new-${state.created}`;
    patch({ people: [...state.people, synCtPerson(id, name, "", "", "", [], { order: 10 + state.created })], created: state.created + 1, adding: false, selected: { type: "person", id } });
  };
  const sortItem = (value, label) => ({ label, icon: state.sort === value ? I("Check") : undefined, onSelect: () => patch({ sort: value }) });
  return h(
    SynFigure,
    { title: L("Contacts"), width: 900, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setState(synCtInitial()) },
    <div className="syn-ct">
      <div className="syn-ct-side">
        <div className="syn-ct-head" style={{ position: "relative" }}>
          <button type="button" className="syn-icon-btn" aria-label={L("Go home")} title={L("Back")}>{h(SynIcon, { name: I("ArrowLeft") })}</button>
          <span style={{ display: "flex", alignItems: "center" }}>
            {showMarkers ? h(SynHotspot, { n: 1, style: { right: 70, top: 7 } }) : null}
            {h(SynMenuButton, { label: L("Sort options"), icon: I("ArrowsDownUp"), items: [sortItem("alphabetical", "A-Z"), sortItem("reverse-alphabetical", "Z-A"), sortItem("oldest", L("Oldest")), sortItem("newest", L("Newest"))] })}
            <button type="button" className="syn-icon-btn" title={L("Add")} aria-label={L("Add")} onClick={() => patch({ adding: true })}>{h(SynIcon, { name: I("Plus") })}</button>
          </span>
        </div>
        <label className="syn-ct-search">
          {h(SynIcon, { name: I("MagnifyingGlass") })}
          <input type="text" aria-label={L("Search contacts...")} placeholder={L("Search contacts...")} value={state.search} onChange={(e) => patch({ search: e.target.value })} onKeyDown={(e) => e.key === "Escape" && patch({ search: "" })} />
          {state.search ? <button type="button" className="syn-icon-btn" style={{ width: 18, height: 18 }} aria-label={L("Clear search")} onClick={() => patch({ search: "" })}>{h(SynIcon, { name: I("X"), size: 14 })}</button> : null}
        </label>
        <div className="syn-ct-list">
          {self ? h(SynCtItem, { label: self.name, sub: self.email, active: isActive("person", self.id), onClick: () => pick("person", self.id), readOnly: true }) : null}
          {state.adding ? (
            <div className="syn-ct-new">
              <input
                ref={newRef}
                autoFocus
                aria-label={L("Add person")}
                placeholder={L("Add person")}
                onKeyDown={(e) => {
                  const value = e.currentTarget.value.trim();
                  if (e.key === "Enter" && value) addPerson(value);
                  if (e.key === "Escape") patch({ adding: false });
                }}
              />
              <button type="button" className="syn-icon-btn" aria-label={L("Add person")} onClick={() => (newRef.current?.value.trim() ? addPerson(newRef.current.value.trim()) : patch({ adding: false }))}>
                {h(SynIcon, { name: I("Plus") })}
              </button>
            </div>
          ) : null}
          {pinned.map(personItem)}
          {pinned.length > 0 ? <div className="syn-ct-divider" /> : null}
          {orgs.map((o) => h(SynCtItem, { key: o.id, label: o.name, org: true, active: isActive("organization", o.id), onClick: () => pick("organization", o.id), pinned: false, onTogglePin: () => {} }))}
          {people.filter((p) => !p.pinned).map(personItem)}
        </div>
      </div>
      <div className="syn-ct-main">
        {person ? h(SynCtPerson, { key: person.id, person, state, patch, update, markers: showMarkers }) : null}
        {org ? h(SynCtOrg, { key: org.id, org, state, patch }) : null}
        <div className="syn-ct-status" role="status">{state.status}</div>
      </div>
    </div>
  );
};
