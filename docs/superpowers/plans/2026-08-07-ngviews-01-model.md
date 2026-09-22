# Neuroglancer Views — PR 1 (`ngviews-01-model`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `views` and `view_layers` database tables, their Pydantic models, DB accessor functions, and one additive Alembic migration — the data-model foundation the whole Neuroglancer Views stack builds on.

**Architecture:** Mirror the existing `NeuroglancerStateDB` / `ProxiedPathDB` patterns in `fileglancer/database.py`. A `ViewDB` row stores the Neuroglancer state + sharing keys; a `ViewLayerDB` row is the many-to-many join between a View and a Data Link (`proxied_paths`). This PR is pure-additive: no routes, no behavior change, existing tables untouched.

**Tech Stack:** Python 3.12, SQLAlchemy (synchronous), Alembic, Pydantic v2, pytest. All commands run through **pixi** (never system tools).

## Global Constraints

- **Always use pixi.** Backend tests run with `pixi run -e test test-backend`. Never call `pytest` or `alembic` directly.
- **Additive only.** Do not modify `neuroglancer_states`, `proxied_paths`, or any existing table/route. This PR changes no runtime behavior.
- **Key generation:** reuse the `secrets.token_urlsafe(12)` pattern; keys must be unique with a retry loop (mirror `_generate_unique_neuroglancer_key`, `database.py:777`).
- **Timestamps:** `datetime.now(UTC)` with the `default`/`onupdate` lambda pattern used by every existing `*_at` column.
- **`edit_key` is reserved, not used.** It is created in the schema so the later editable-Views stack needs no second migration. No code reads or writes it in this PR. Mark it with a `# ponytail: edit_key reserved, unused until the edit stack` comment.
- **`sharing_mode`** values in this scope: `'private'` and `'read'` only. Default `'read'`.
- **Migration `down_revision` is the current sole Alembic head** — `e7b2a9c4f130` at authoring time. Verify the live head before generating (heads advance as PRs merge; `alembic ... heads` or a scan of `fileglancer/alembic/versions/` for the revision that is nobody's `down_revision`). A wrong `down_revision` creates two heads and breaks `alembic upgrade head`.
- **Branch:** all commits land on `ngviews-01-model`, branched off `main`. Create it before Task 1: `git checkout main && git checkout -b ngviews-01-model`.

---

### Task 1: `ViewDB` + `ViewLayerDB` models and `create_view` / `get_view_by_short_key`

**Files:**
- Modify: `fileglancer/database.py` (add models after `NeuroglancerStateDB`, `database.py:119`; add helpers after `delete_neuroglancer_state`, `database.py:854`)
- Test: `tests/test_database.py` (add after the proxied-path tests, ~`tests/test_database.py:188`)

**Interfaces:**
- Consumes: `Base`, `secrets`, `datetime`, `UTC`, `Session`, `Optional`, `Dict`, `List` (all already imported at `database.py:1-13`). Add `ForeignKey`, `Boolean` to the `sqlalchemy` import on `database.py:7`.
- Produces:
  - `class ViewDB(Base)` — table `views`; columns `id, short_key, read_key, edit_key, name, ng_state (JSON), sharing_mode, owner, created_at, updated_at`.
  - `class ViewLayerDB(Base)` — table `view_layers`; columns `id, view_id (FK views.id), data_link_id (FK proxied_paths.id, nullable), layer_index, channel (nullable), opts (JSON nullable), broken (Boolean default False)`.
  - `_generate_unique_view_key(session) -> str`
  - `create_view(session, username: str, name: str, ng_state: Dict, layers: List[Dict], sharing_mode: str = 'read') -> ViewDB` where each layer dict is `{'data_link_id': Optional[int], 'layer_index': int, 'channel': Optional[str], 'opts': Optional[Dict]}`.
  - `get_view_by_short_key(session, short_key: str) -> Optional[ViewDB]`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_database.py`:

```python
def test_create_and_get_view(db_session):
    layers = [
        {"data_link_id": None, "layer_index": 0, "channel": "Ch0", "opts": {"color": "red"}},
        {"data_link_id": None, "layer_index": 1, "channel": None, "opts": None},
    ]
    view = create_view(
        db_session,
        username="testuser",
        name="seed6 overlay",
        ng_state={"layers": []},
        layers=layers,
        sharing_mode="read",
    )
    assert view.short_key is not None
    assert view.read_key is not None
    assert view.edit_key is not None
    assert view.short_key != view.read_key != view.edit_key
    assert view.owner == "testuser"
    assert view.sharing_mode == "read"

    fetched = get_view_by_short_key(db_session, view.short_key)
    assert fetched is not None
    assert fetched.name == "seed6 overlay"
    assert len(fetched.layers) == 2
    assert {l.layer_index for l in fetched.layers} == {0, 1}
    assert fetched.layers[0].channel == "Ch0"
    assert fetched.layers[0].broken is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run -e test test-backend -- tests/test_database.py::test_create_and_get_view`
Expected: FAIL with `NameError: name 'create_view' is not defined`.

- [ ] **Step 3: Add the models**

In `fileglancer/database.py`, change the import on line 7 to include `ForeignKey` and `Boolean`:

```python
from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, UniqueConstraint, ForeignKey, Boolean
```

Add a constant next to the others (`database.py:22`):

```python
VIEW_KEY_LENGTH = 12
```

Add after `NeuroglancerStateDB` (after `database.py:119`), before `TicketDB`:

```python
from sqlalchemy.orm import relationship


class ViewDB(Base):
    """Database model for a Neuroglancer View (state + sharing keys)."""
    __tablename__ = 'views'

    id = Column(Integer, primary_key=True, autoincrement=True)
    short_key = Column(String, nullable=False, unique=True, index=True)
    read_key = Column(String, nullable=False, unique=True, index=True)
    # ponytail: edit_key reserved, unused until the edit stack
    edit_key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    ng_state = Column(JSON, nullable=False)
    sharing_mode = Column(String, nullable=False, server_default='read')
    owner = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    layers = relationship(
        'ViewLayerDB',
        back_populates='view',
        cascade='all, delete-orphan',
        order_by='ViewLayerDB.layer_index',
    )


class ViewLayerDB(Base):
    """Join row: one dataset/channel layer of a View, backed by a Data Link."""
    __tablename__ = 'view_layers'

    id = Column(Integer, primary_key=True, autoincrement=True)
    view_id = Column(Integer, ForeignKey('views.id'), nullable=False, index=True)
    data_link_id = Column(Integer, ForeignKey('proxied_paths.id'), nullable=True, index=True)
    layer_index = Column(Integer, nullable=False)
    channel = Column(String, nullable=True)
    opts = Column(JSON, nullable=True)
    broken = Column(Boolean, nullable=False, server_default=sa_false())

    view = relationship('ViewDB', back_populates='layers')
```

`server_default` for a boolean needs a SQL literal. Add this import at the top of `database.py` with the other sqlalchemy imports (`database.py:7-8` area):

```python
from sqlalchemy import false as sa_false
```

- [ ] **Step 4: Add the helper functions**

Add after `delete_neuroglancer_state` (`database.py:854`):

```python
def _generate_unique_view_key(session: Session) -> str:
    """Generate a short key unique across all View keys (short/read/edit)."""
    for _ in range(10):
        candidate = secrets.token_urlsafe(VIEW_KEY_LENGTH)
        clash = session.query(ViewDB).filter(
            (ViewDB.short_key == candidate)
            | (ViewDB.read_key == candidate)
            | (ViewDB.edit_key == candidate)
        ).first()
        if not clash:
            return candidate
    raise RuntimeError("Failed to generate a unique View key")


def create_view(
    session: Session,
    username: str,
    name: str,
    ng_state: Dict,
    layers: List[Dict],
    sharing_mode: str = 'read',
) -> ViewDB:
    """Create a View plus its ViewLayer rows. Returns the persisted ViewDB.

    Each layer dict: {data_link_id, layer_index, channel, opts}.
    """
    now = datetime.now(UTC)
    view = ViewDB(
        short_key=_generate_unique_view_key(session),
        read_key=_generate_unique_view_key(session),
        edit_key=_generate_unique_view_key(session),
        name=name,
        ng_state=ng_state,
        sharing_mode=sharing_mode,
        owner=username,
        created_at=now,
        updated_at=now,
    )
    for layer in layers:
        view.layers.append(ViewLayerDB(
            data_link_id=layer.get('data_link_id'),
            layer_index=layer['layer_index'],
            channel=layer.get('channel'),
            opts=layer.get('opts'),
        ))
    session.add(view)
    session.commit()
    return view


def get_view_by_short_key(session: Session, short_key: str) -> Optional[ViewDB]:
    """Get an owned View by its short key."""
    return session.query(ViewDB).filter_by(short_key=short_key).first()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pixi run -e test test-backend -- tests/test_database.py::test_create_and_get_view`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fileglancer/database.py tests/test_database.py
git commit -m "feat(views): add ViewDB/ViewLayerDB models and create/get helpers"
```

---

### Task 2: List / update / delete / dependent-views helpers

**Files:**
- Modify: `fileglancer/database.py` (add after `get_view_by_short_key` from Task 1)
- Test: `tests/test_database.py`

**Interfaces:**
- Consumes: `ViewDB`, `ViewLayerDB`, `create_view` (Task 1).
- Produces:
  - `get_view_by_read_key(session, read_key: str) -> Optional[ViewDB]`
  - `get_views(session, username: str) -> List[ViewDB]` (newest first)
  - `update_view(session, username, short_key, name=None, ng_state=None) -> Optional[ViewDB]`
  - `delete_view(session, username, short_key) -> int` (rows deleted; cascades to layers)
  - `get_views_for_data_link(session, data_link_id: int) -> List[ViewDB]` (distinct Views with a layer backed by this Data Link)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_database.py`:

```python
def test_get_views_and_read_key(db_session):
    v1 = create_view(db_session, "u", "one", {"layers": []}, [], "read")
    v2 = create_view(db_session, "u", "two", {"layers": []}, [], "private")
    create_view(db_session, "other", "three", {"layers": []}, [], "read")

    mine = get_views(db_session, "u")
    assert [v.name for v in mine] == ["two", "one"]  # newest first

    assert get_view_by_read_key(db_session, v1.read_key).short_key == v1.short_key
    assert get_view_by_read_key(db_session, "nope") is None
    assert v2.sharing_mode == "private"


def test_update_and_delete_view(db_session):
    v = create_view(db_session, "u", "before", {"layers": [1]}, [], "read")
    updated = update_view(db_session, "u", v.short_key, name="after", ng_state={"layers": [2]})
    assert updated.name == "after"
    assert updated.ng_state == {"layers": [2]}
    assert update_view(db_session, "wronguser", v.short_key, name="x") is None

    assert delete_view(db_session, "u", v.short_key) == 1
    assert get_view_by_short_key(db_session, v.short_key) is None


def test_get_views_for_data_link(db_session):
    layers = [{"data_link_id": 42, "layer_index": 0, "channel": None, "opts": None}]
    v = create_view(db_session, "u", "linked", {"layers": []}, layers, "read")
    create_view(db_session, "u", "unlinked", {"layers": []}, [], "read")

    dependents = get_views_for_data_link(db_session, 42)
    assert [d.short_key for d in dependents] == [v.short_key]
    assert get_views_for_data_link(db_session, 999) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pixi run -e test test-backend -- tests/test_database.py -k "views_and_read_key or update_and_delete_view or views_for_data_link"`
Expected: FAIL with `NameError` on the new helpers.

- [ ] **Step 3: Implement the helpers**

Add after `get_view_by_short_key` in `database.py`:

```python
def get_view_by_read_key(session: Session, read_key: str) -> Optional[ViewDB]:
    """Resolve a View by its read key (read-only share access)."""
    return session.query(ViewDB).filter_by(read_key=read_key).first()


def get_views(session: Session, username: str) -> List[ViewDB]:
    """Get all Views owned by a user, newest first."""
    return (
        session.query(ViewDB)
        .filter_by(owner=username)
        .order_by(ViewDB.created_at.desc())
        .all()
    )


def update_view(
    session: Session,
    username: str,
    short_key: str,
    name: Optional[str] = None,
    ng_state: Optional[Dict] = None,
) -> Optional[ViewDB]:
    """Update an owned View's name and/or state. Returns None if not owned/found."""
    view = session.query(ViewDB).filter_by(short_key=short_key, owner=username).first()
    if not view:
        return None
    if name is not None:
        view.name = name
    if ng_state is not None:
        view.ng_state = ng_state
    view.updated_at = datetime.now(UTC)
    session.commit()
    return view


def delete_view(session: Session, username: str, short_key: str) -> int:
    """Delete an owned View (cascades to its layers). Returns rows deleted."""
    view = session.query(ViewDB).filter_by(short_key=short_key, owner=username).first()
    if not view:
        return 0
    session.delete(view)
    session.commit()
    return 1


def get_views_for_data_link(session: Session, data_link_id: int) -> List[ViewDB]:
    """Distinct Views that have at least one layer backed by this Data Link."""
    return (
        session.query(ViewDB)
        .join(ViewLayerDB, ViewLayerDB.view_id == ViewDB.id)
        .filter(ViewLayerDB.data_link_id == data_link_id)
        .distinct()
        .all()
    )
```

Note: `delete_view` uses `session.delete(view)` (not a bulk `.delete()`) so the `cascade='all, delete-orphan'` on the `layers` relationship removes the join rows.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pixi run -e test test-backend -- tests/test_database.py -k "views_and_read_key or update_and_delete_view or views_for_data_link"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add fileglancer/database.py tests/test_database.py
git commit -m "feat(views): add list/update/delete/dependent-views DB helpers"
```

---

### Task 3: Pydantic models

**Files:**
- Modify: `fileglancer/model.py` (add after `ProxiedPathResponse`, `model.py:163`)
- Test: `tests/test_database.py` (a serialization test that converts a `ViewDB` to the Pydantic `View`)

**Interfaces:**
- Consumes: `BaseModel`, `Field`, `datetime`, `Optional`, `List`, `Dict` (already imported in `model.py`).
- Produces:
  - `class ViewLayer(BaseModel)` — `layer_index: int`, `data_link_id: Optional[int]`, `channel: Optional[str]`, `opts: Optional[Dict]`, `broken: bool`.
  - `class View(BaseModel)` — `short_key, read_key, name, ng_state: Dict, sharing_mode, owner, created_at, updated_at, layers: List[ViewLayer]`. **Note: no `edit_key`** — it is not exposed in read-only scope.
  - `class ViewResponse(BaseModel)` — `views: List[View]`.
  - A `model_config = ConfigDict(from_attributes=True)` on `ViewLayer` and `View` so they build from ORM rows via `View.model_validate(view_db)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_database.py` (import at top of the function to avoid touching the module import block):

```python
def test_view_pydantic_from_orm(db_session):
    from fileglancer.model import View
    layers = [{"data_link_id": 7, "layer_index": 0, "channel": "Ch0", "opts": None}]
    view_db = create_view(db_session, "u", "demo", {"layers": []}, layers, "read")

    model = View.model_validate(view_db)
    assert model.short_key == view_db.short_key
    assert model.read_key == view_db.read_key
    assert model.name == "demo"
    assert model.sharing_mode == "read"
    assert len(model.layers) == 1
    assert model.layers[0].channel == "Ch0"
    assert model.layers[0].broken is False
    # edit_key must NOT be exposed in read-only scope
    assert not hasattr(model, "edit_key")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run -e test test-backend -- tests/test_database.py::test_view_pydantic_from_orm`
Expected: FAIL with `ImportError: cannot import name 'View'`.

- [ ] **Step 3: Add the Pydantic models**

Ensure `ConfigDict` is imported in `model.py` (check the existing `from pydantic import ...` line; add `ConfigDict` if absent). Add after `ProxiedPathResponse` (`model.py:163`):

```python
class ViewLayer(BaseModel):
    """One dataset/channel layer of a Neuroglancer View."""
    model_config = ConfigDict(from_attributes=True)

    layer_index: int = Field(description="Position of this layer within the View")
    data_link_id: Optional[int] = Field(
        default=None,
        description="ID of the Data Link (proxied path) backing this layer; null if broken",
    )
    channel: Optional[str] = Field(default=None, description="Channel identifier, if this layer is one channel")
    opts: Optional[Dict] = Field(default=None, description="Per-layer options")
    broken: bool = Field(default=False, description="True if the backing Data Link was deleted")


class View(BaseModel):
    """A Neuroglancer View: saved NG state + its layers + sharing settings."""
    model_config = ConfigDict(from_attributes=True)

    short_key: str = Field(description="Owner-facing key identifying this View")
    read_key: str = Field(description="Key that opens this View read-only")
    name: str = Field(description="Display name of the View")
    ng_state: Dict = Field(description="The Neuroglancer state JSON")
    sharing_mode: str = Field(description="'private' or 'read'")
    owner: str = Field(description="Username of the View owner")
    created_at: datetime = Field(description="When this View was created")
    updated_at: datetime = Field(description="When this View was last updated")
    layers: List[ViewLayer] = Field(default_factory=list, description="The layers of this View")


class ViewResponse(BaseModel):
    views: List[View] = Field(description="A list of Neuroglancer Views")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pixi run -e test test-backend -- tests/test_database.py::test_view_pydantic_from_orm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fileglancer/model.py tests/test_database.py
git commit -m "feat(views): add View/ViewLayer/ViewResponse Pydantic models"
```

---

### Task 4: Alembic migration for `views` + `view_layers`

**Files:**
- Create: `fileglancer/alembic/versions/<generated>_add_views_tables.py`
- (No new test file; verified by running the migration up and down against a scratch DB.)

**Interfaces:**
- Consumes: the model definitions from Task 1 (the migration must match them column-for-column).
- Produces: a migration with `down_revision` set to the current sole head (`e7b2a9c4f130` at authoring time) creating both tables, and a `downgrade()` that drops them in FK-safe order (`view_layers` before `views`).

- [ ] **Step 1: Autogenerate the migration**

Run the project's migrate-create task (`migrate-create = "alembic -c fileglancer/alembic.ini revision --autogenerate"` — `--autogenerate` is already included, so only pass the message):

Run: `pixi run migrate-create -- -m "add views tables"`

This writes a new file under `fileglancer/alembic/versions/`. Open it and verify `down_revision` is the current sole head (`e7b2a9c4f130` at authoring time — autogenerate resolves it automatically; confirm it matches the live head and fix it if not).

- [ ] **Step 2: Replace the generated body with an explicit, reviewed version**

Autogenerate can misorder FK drops and omit `server_default`s. Overwrite `upgrade()`/`downgrade()` with this (keep the generated `revision`/`down_revision`/`Create Date` header):

```python
def upgrade() -> None:
    op.create_table(
        'views',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('short_key', sa.String(), nullable=False),
        sa.Column('read_key', sa.String(), nullable=False),
        sa.Column('edit_key', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ng_state', sa.JSON(), nullable=False),
        sa.Column('sharing_mode', sa.String(), nullable=False, server_default='read'),
        sa.Column('owner', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('short_key', name='uq_views_short_key'),
        sa.UniqueConstraint('read_key', name='uq_views_read_key'),
        sa.UniqueConstraint('edit_key', name='uq_views_edit_key'),
    )
    op.create_index('ix_views_short_key', 'views', ['short_key'], unique=True)
    op.create_index('ix_views_read_key', 'views', ['read_key'], unique=True)
    op.create_index('ix_views_edit_key', 'views', ['edit_key'], unique=True)
    op.create_index('ix_views_owner', 'views', ['owner'])

    op.create_table(
        'view_layers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('view_id', sa.Integer(), sa.ForeignKey('views.id'), nullable=False),
        sa.Column('data_link_id', sa.Integer(), sa.ForeignKey('proxied_paths.id'), nullable=True),
        sa.Column('layer_index', sa.Integer(), nullable=False),
        sa.Column('channel', sa.String(), nullable=True),
        sa.Column('opts', sa.JSON(), nullable=True),
        sa.Column('broken', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_view_layers_view_id', 'view_layers', ['view_id'])
    op.create_index('ix_view_layers_data_link_id', 'view_layers', ['data_link_id'])


def downgrade() -> None:
    op.drop_index('ix_view_layers_data_link_id', table_name='view_layers')
    op.drop_index('ix_view_layers_view_id', table_name='view_layers')
    op.drop_table('view_layers')
    op.drop_index('ix_views_owner', table_name='views')
    op.drop_index('ix_views_edit_key', table_name='views')
    op.drop_index('ix_views_read_key', table_name='views')
    op.drop_index('ix_views_short_key', table_name='views')
    op.drop_table('views')
```

- [ ] **Step 3: Verify the migration applies and reverses**

Run the migration to head, then confirm the schema exists, then verify downgrade removes the tables. Use the project migrate task against a throwaway sqlite DB in the scratchpad:

Settings use `env_prefix='fgc_'` (`fileglancer/settings.py:135`) over `db_url`, so the DB-URL env var is **`FGC_DB_URL`**:

```bash
FGDB=/tmp/claude-66302/-opt-fileglancer/61242884-cc6f-4362-8393-066a34fec95a/scratchpad/ngviews-migrate.db
rm -f "$FGDB"
FGC_DB_URL="sqlite:///$FGDB" pixi run migrate
pixi run python -c "import sqlalchemy as sa; e=sa.create_engine('sqlite:///$FGDB'); print(sorted(sa.inspect(e).get_table_names()))"
```
Expected: the printed table list includes `views` and `view_layers`.

- [ ] **Step 4: Confirm the full backend suite still passes**

Run: `pixi run -e test test-backend`
Expected: PASS, including the four new View tests from Tasks 1–3. This also confirms `Base.metadata.create_all` (used by the `db_session` fixture) builds the new tables cleanly.

- [ ] **Step 5: Commit**

```bash
git add fileglancer/alembic/versions/
git commit -m "feat(views): add Alembic migration for views and view_layers tables"
```

---

## Self-Review

**Spec coverage (PR 1 slice of §4/§8):** `views` table ✓ (Task 1), `view_layers` join with nullable `data_link_id` + `broken` ✓ (Task 1), `edit_key` reserved/unexposed ✓ (Tasks 1, 3), `sharing_mode` `private|read` ✓ (Tasks 1–3), cart-as-preference — correctly **not** here (no schema change needed, lands in a later PR), Pydantic models ✓ (Task 3), `get_views_for_data_link` for the later delete-guard + "Appears in N Views" ✓ (Task 2), one additive migration off the current head ✓ (Task 4 — implemented as `1e8dc304b4f2` off `e7b2a9c4f130`, the true sole head; the plan's earlier `c1f9a4e7b2d8` was stale).

**Placeholder scan:** No TBD/TODO; every code step is concrete.

**Type consistency:** `create_view(session, username, name, ng_state, layers, sharing_mode)` and the layer-dict shape `{data_link_id, layer_index, channel, opts}` are identical in Tasks 1, 2, 3. `View` Pydantic model excludes `edit_key` in both Task 3's definition and its test. `delete_view` returns `int` (Task 2 signature + test). `ViewLayerDB.broken` default `False` asserted in Tasks 1 and 3.

## Out of scope for this PR (next plans)

- PR 2 `ngviews-02-api`: Views CRUD routes, `GET /ngview/{key}` (read key), `GET /api/proxied-path/{sharing_key}/views`, Data Link delete modes (`mark_broken` | `cascade`).
- PR 3–6: frontend (multi-select, Views page, browser entry points, read-only embedded viewer).

Each gets its own plan once the interfaces below it are locked.
