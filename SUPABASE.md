# Supabase

Project: talent-management
Project ref: `olvetzzzkwryluedlhpv`
Region: ap-northeast-1

## Authentication
- Supabase Auth
- Email / password
- First registered user is assigned `owner`
- Additional users must be added to `management_members` by an owner

## Roles
`owner`, `admin`, `manager`, `accounting`, `legal`, `creative`, `talent`

## Main tables
- profiles
- management_members
- talents
- talent_profiles
- management_projects
- project_talents
- schedules
- revenue_transactions
- revenue_distributions
- contracts
- activity_reports
- audit_logs

All exposed application tables have RLS enabled. The frontend uses only the Supabase publishable key; service-role credentials are not included in the repository.
