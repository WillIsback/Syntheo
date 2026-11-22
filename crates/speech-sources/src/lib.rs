//! Sources de téléchargement des modèles de la transcription sur le poste
//! (issue 683) : un seul validateur pour les sources compilées
//! (`models.json`, `SYNTHEO_SPEECH_MODELS_URLS`, contrôlées par le build.rs de
//! l'application) et pour le réglage géré `speech_models_urls` (db-app), que
//! speech-host emploie ensuite. Une adresse acceptée à un endroit l'est
//! partout.

/// Au plus ce nombre de sources.
pub const MAX_SOURCES: usize = 8;

/// Une source de téléchargement : gabarit d'URL HTTPS, sans identifiants.
/// `{path}` : chemin relatif du fichier (`nemotron/encoder.onnx`, pour une
/// arborescence, par exemple Hugging Face `…/resolve/<révision>/{path}`) ;
/// `{name}` : son seul nom (`encoder.onnx`, pour des fichiers à plat, par
/// exemple les assets d'une release GitHub `…/download/<tag>/{name}`). Sans
/// marqueur, l'adresse est une base à laquelle `/{path}` est ajouté.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source(String);

impl Source {
    /// Valide une source : préfixe littéral `https://` (minuscules) suivi d'un
    /// hôte, sans identifiants (`user:pass@`), requête, fragment, espace ni
    /// virgule, ni autre marqueur que `{path}` et `{name}`, au plus 2048
    /// caractères.
    pub fn parse(raw: &str) -> Option<Self> {
        let raw = raw.trim();
        if raw.len() > 2048 {
            return None;
        }
        let probe = raw.replace("{path}", "p").replace("{name}", "n");
        if probe.contains(['{', '}', ',']) || probe.contains(char::is_whitespace) {
            return None;
        }
        // `https:///x` serait lu comme l'hôte `x`, `HTTPS://` ou `https:x`
        // seraient normalisés par l'analyseur : préfixe littéral exigé.
        if raw.strip_prefix("https://")?.starts_with('/') {
            return None;
        }
        let url = url::Url::parse(&probe).ok()?;
        let valid = url.scheme() == "https"
            && url.host_str().is_some_and(|h| !h.is_empty())
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none();
        valid.then(|| Self(raw.to_owned()))
    }

    /// Adresse du fichier de chemin relatif `path` (séparateur `/`).
    pub fn url_for(&self, path: &str) -> String {
        let name = path.rsplit('/').next().unwrap_or(path);
        if self.0.contains("{path}") || self.0.contains("{name}") {
            self.0.replace("{path}", path).replace("{name}", name)
        } else {
            format!("{}/{}", self.0.trim_end_matches('/'), path)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Source sans validation, pour un serveur local de test (feature
    /// `test-unchecked`, jamais activée par l'application).
    #[cfg(feature = "test-unchecked")]
    pub fn unchecked_for_tests(raw: String) -> Self {
        Self(raw)
    }
}

/// Liste ordonnée de sources, séparées par des virgules (ou une liste déjà
/// découpée). Une seule source invalide rend toute la liste invalide :
/// mieux vaut refuser qu'ignorer en silence un miroir mal saisi.
pub fn parse_sources<'a>(items: impl IntoIterator<Item = &'a str>) -> Option<Vec<Source>> {
    let mut sources = Vec::new();
    for item in items {
        for raw in item.split(',').map(str::trim).filter(|r| !r.is_empty()) {
            sources.push(Source::parse(raw)?);
        }
    }
    (!sources.is_empty() && sources.len() <= MAX_SOURCES).then_some(sources)
}

/// Sources du champ `sources` d'un `models.json` : `Some(vide)` s'il est
/// absent ou vide, `None` s'il est mal formé ou contient une source invalide.
pub fn models_json_sources(json: &str) -> Option<Vec<Source>> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let Some(list) = value.get("sources") else {
        return Some(Vec::new());
    };
    let list = list.as_array()?;
    if list.is_empty() {
        return Some(Vec::new());
    }
    let items: Option<Vec<&str>> = list.iter().map(serde_json::Value::as_str).collect();
    parse_sources(items?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sources_are_https_templates_without_credentials() {
        let path = "nemotron/encoder.onnx";
        let github = Source::parse(
            "https://github.com/WillIsback/Syntheo/releases/download/speech-models-1/{name}",
        )
        .unwrap();
        assert_eq!(
            github.url_for(path),
            "https://github.com/WillIsback/Syntheo/releases/download/speech-models-1/encoder.onnx"
        );
        let hf = Source::parse("https://huggingface.co/x/y/resolve/0123abcd/{path}").unwrap();
        assert_eq!(
            hf.url_for(path),
            "https://huggingface.co/x/y/resolve/0123abcd/nemotron/encoder.onnx"
        );
        let base = Source::parse("https://miroir.example/modeles/").unwrap();
        assert_eq!(
            base.url_for(path),
            "https://miroir.example/modeles/nemotron/encoder.onnx"
        );
        for bad in [
            "http://miroir.example/{path}",
            "HTTPS://miroir.example/{path}",
            "https:miroir.example/{path}",
            "https:/miroir.example/{path}",
            "https://user:secret@miroir.example/{path}",
            "https://jeton@miroir.example/{path}",
            "https://miroir.example/{path}?token=1",
            "https://miroir.example/{path}#x",
            "https://miroir.example/{autre}",
            "https://a.example/{path},https://b.example",
            "file:///etc/{path}",
            "https:///{path}",
            "",
        ] {
            assert!(Source::parse(bad).is_none(), "{bad}");
        }
        assert!(Source::parse(&format!("https://a.example/{}", "x".repeat(2100))).is_none());
    }

    #[test]
    fn lists_are_valid_as_a_whole() {
        let list = parse_sources(["https://a.example/{name}, https://b.example/{path}"]).unwrap();
        assert_eq!(list.len(), 2);
        assert!(parse_sources(["https://a.example/{name},http://b.example/{path}"]).is_none());
        assert!(parse_sources([" , "]).is_none());
        let nine = vec!["https://a.example/{path}"; MAX_SOURCES + 1];
        assert!(parse_sources(nine).is_none());
    }

    #[test]
    fn reads_the_sources_of_models_json() {
        assert_eq!(models_json_sources(r#"{"files":[]}"#), Some(vec![]));
        assert_eq!(models_json_sources(r#"{"sources":[]}"#), Some(vec![]));
        assert_eq!(
            models_json_sources(r#"{"sources":["https://a.example/{path}"]}"#)
                .unwrap()
                .len(),
            1
        );
        assert!(models_json_sources(r#"{"sources":["http://a.example/{path}"]}"#).is_none());
        assert!(models_json_sources(r#"{"sources":"https://a.example"}"#).is_none());
        assert!(models_json_sources("pas du json").is_none());
    }
}
