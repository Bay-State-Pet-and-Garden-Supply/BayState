# Issues & Blockers

## 2026-04-04: Supabase MCP NotFoundException on project-specific calls

**Issue**: list_projects succeeds but all project-specific MCP functions fail with:
```
NotFoundException: Project reference in URL is not valid. Check the URL of the resource.
```

**Affected Functions**:
- execute_sql
- list_tables
- get_advisors
- list_migrations
- get_project
- get_project_url

**Working Function**:
- list_projects (returns project ID: fapnuczapcatelxxmrail)

**Impact**: Cannot run SQL queries or perform any database operations via Supabase MCP despite successful project discovery.

**Possible Causes**:
1. MCP session/authentication state not properly maintained between calls
2. Project reference format issue in MCP server
3. Rate limiting or temporary block on project-specific endpoints

**Workaround**: Use Supabase dashboard directly or psql CLI for database queries.

**Status**: UNRESOLVED
