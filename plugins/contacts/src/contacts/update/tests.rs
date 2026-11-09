use super::*;
use syntheo_db_core::Db;

async fn test_db() -> Db {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    db
}

async fn seed_human(db: &Db, id: &str, deleted: bool) {
    sqlx::query(
        "INSERT INTO humans (id, owner_user_id, name, email, deleted_at)
             VALUES (?, 'user-1', 'Ada', 'ada@example.com', ?)",
    )
    .bind(id)
    .bind(deleted.then_some("2026-01-01T00:00:00.000Z"))
    .execute(db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn update_human_sets_only_present_fields_and_skips_deleted_rows() {
    let db = test_db().await;
    seed_human(&db, "human-1", false).await;
    seed_human(&db, "human-deleted", true).await;

    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-1".to_string(),
            name: Some("Alice Kim".to_string()),
            email: None,
            phone: None,
            job_title: Some("Staff Engineer".to_string()),
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: None,
        },
    )
    .await
    .unwrap();

    let (name, email, job_title): (String, String, String) =
        sqlx::query_as("SELECT name, email, job_title FROM humans WHERE id = 'human-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(
        (name.as_str(), email.as_str(), job_title.as_str()),
        ("Alice Kim", "ada@example.com", "Staff Engineer")
    );

    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-deleted".to_string(),
            name: Some("Changed".to_string()),
            email: None,
            phone: None,
            job_title: None,
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: None,
        },
    )
    .await
    .unwrap();
    let name: String = sqlx::query_scalar("SELECT name FROM humans WHERE id = 'human-deleted'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(name, "Ada");

    // No fields -> no transaction, succeeds.
    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-1".to_string(),
            name: None,
            email: None,
            phone: None,
            job_title: None,
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: None,
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn update_human_normalizes_and_stores_additional_emails() {
    let db = test_db().await;
    sqlx::query(
        "INSERT INTO humans (id, owner_user_id, name, email, metadata_json)
             VALUES ('human-1', 'user-1', 'Ada', 'ada@example.com', json_object('other', 'keep'))",
    )
    .execute(db.pool())
    .await
    .unwrap();

    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-1".to_string(),
            name: None,
            email: None,
            phone: None,
            job_title: None,
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: Some(vec![
                "  work@example.com ".to_string(),
                "ADA@example.com".to_string(),
                "Work@Example.com".to_string(),
                "".to_string(),
                "home@example.com".to_string(),
            ]),
        },
    )
    .await
    .unwrap();

    let metadata: serde_json::Value = serde_json::from_str(
        &sqlx::query_scalar::<_, String>("SELECT metadata_json FROM humans WHERE id = 'human-1'")
            .fetch_one(db.pool())
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["other"], "keep");
    assert_eq!(
        metadata["additionalEmails"],
        serde_json::json!(["work@example.com", "home@example.com"])
    );

    // Emptying the list removes the key.
    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-1".to_string(),
            name: None,
            email: None,
            phone: None,
            job_title: None,
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: Some(vec![]),
        },
    )
    .await
    .unwrap();
    let metadata: serde_json::Value = serde_json::from_str(
        &sqlx::query_scalar::<_, String>("SELECT metadata_json FROM humans WHERE id = 'human-1'")
            .fetch_one(db.pool())
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["other"], "keep");
    assert!(metadata.get("additionalEmails").is_none());
}

#[tokio::test]
async fn update_human_primary_email_drop_that_address_from_additional_emails() {
    let db = test_db().await;
    sqlx::query(
        "INSERT INTO humans (id, owner_user_id, name, email, metadata_json)
             VALUES ('human-1', 'user-1', 'Ada', 'ada@example.com',
               json_object('other', 'keep',
                 'additionalEmails', json_array('work@example.com', 'home@example.com')))",
    )
    .execute(db.pool())
    .await
    .unwrap();

    update_human(
        db.pool(),
        UpdateHumanRequest {
            human_id: "human-1".to_string(),
            name: None,
            email: Some("Work@Example.com".to_string()),
            phone: None,
            job_title: None,
            linkedin_username: None,
            memo: None,
            organization_id: None,
            additional_emails: None,
        },
    )
    .await
    .unwrap();

    let metadata: serde_json::Value = serde_json::from_str(
        &sqlx::query_scalar::<_, String>("SELECT metadata_json FROM humans WHERE id = 'human-1'")
            .fetch_one(db.pool())
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["other"], "keep");
    assert_eq!(
        metadata["additionalEmails"],
        serde_json::json!(["home@example.com"])
    );
}

#[tokio::test]
async fn update_organization_sets_only_present_fields() {
    let db = test_db().await;
    sqlx::query("INSERT INTO organizations (id, owner_user_id, name, memo) VALUES ('org-1', 'user-1', 'Acme', 'old')")
        .execute(db.pool())
        .await
        .unwrap();

    update_organization(
        db.pool(),
        UpdateOrganizationRequest {
            organization_id: "org-1".to_string(),
            name: None,
            memo: Some("new".to_string()),
        },
    )
    .await
    .unwrap();

    let (name, memo): (String, String) =
        sqlx::query_as("SELECT name, memo FROM organizations WHERE id = 'org-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!((name.as_str(), memo.as_str()), ("Acme", "new"));
}

#[tokio::test]
async fn soft_delete_keeps_the_original_deleted_at_on_second_call() {
    let db = test_db().await;
    seed_human(&db, "human-1", false).await;

    soft_delete_contact(
        db.pool(),
        SoftDeleteContactRequest {
            kind: ContactKind::Human,
            contact_id: "human-1".to_string(),
        },
    )
    .await
    .unwrap();
    let first: String = sqlx::query_scalar("SELECT deleted_at FROM humans WHERE id = 'human-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert!(first.ends_with('Z'));

    soft_delete_contact(
        db.pool(),
        SoftDeleteContactRequest {
            kind: ContactKind::Human,
            contact_id: "human-1".to_string(),
        },
    )
    .await
    .unwrap();
    let second: String = sqlx::query_scalar("SELECT deleted_at FROM humans WHERE id = 'human-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(first, second);
}

#[tokio::test]
async fn avatar_and_summary_keep_other_metadata_keys() {
    let db = test_db().await;
    sqlx::query(
        "INSERT INTO humans (id, owner_user_id, name, metadata_json)
             VALUES ('human-1', 'user-1', 'Ada', json_object('other', 'keep'))",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO organizations (id, owner_user_id, name) VALUES ('org-1', 'user-1', 'Acme')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    update_contact_avatar(
        db.pool(),
        UpdateContactAvatarRequest {
            kind: ContactKind::Human,
            contact_id: "human-1".to_string(),
            avatar_data_url: Some("data:image/jpeg;base64,abc".to_string()),
        },
    )
    .await
    .unwrap();
    update_human_contact_summary(
        db.pool(),
        UpdateHumanContactSummaryRequest {
            human_id: "human-1".to_string(),
            summary_json: r#"{"facts":["a","b","c"],"sourceHash":"s"}"#.to_string(),
        },
    )
    .await
    .unwrap();

    let metadata: serde_json::Value = serde_json::from_str(
        &sqlx::query_scalar::<_, String>("SELECT metadata_json FROM humans WHERE id = 'human-1'")
            .fetch_one(db.pool())
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["other"], "keep");
    assert_eq!(metadata["avatarDataUrl"], "data:image/jpeg;base64,abc");
    assert_eq!(metadata["contactSummary"]["sourceHash"], "s");

    update_contact_avatar(
        db.pool(),
        UpdateContactAvatarRequest {
            kind: ContactKind::Organization,
            contact_id: "org-1".to_string(),
            avatar_data_url: None,
        },
    )
    .await
    .unwrap();
    let metadata: String =
        sqlx::query_scalar("SELECT metadata_json FROM organizations WHERE id = 'org-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(metadata, "{}");
}
