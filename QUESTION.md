# Backend Take-Home Assignment

## Enterprise Twitter (Multi-Tenant)

### Problem

Build a backend service for an **enterprise Twitter-like application**.

A **single backend system** must support **multiple companies (tenants)**.
Users can post short messages (“tweets”) that are visible **only within their company**, with optional department-based access control.

---

### Requirements

#### Multi-Tenancy

* One backend serves multiple companies
* Each request is associated with a `companyId`
* Users must never see data from another company

---

#### Users & Departments

* A user belongs to **one company**
* A user can belong to **multiple departments**
* Departments:

  * Belong to one company
  * Form a hierarchy (parent → sub-departments)

---

#### Tweets

Each tweet has:

* Author
* Company
* Content
* Visibility type
* Timestamp

Visibility types:

* **COMPANY** – visible to all users in the same company
* **DEPARTMENTS** – visible to users in specified departments
* **DEPARTMENTS_AND_SUBDEPARTMENTS** – visible to users in specified departments and their sub-departments

A tweet may target **multiple departments**.

---

#### Access Control

A user can see a tweet **only if**:

* The tweet belongs to the same company
* And the tweet’s visibility rules allow it based on the user’s department memberships

---

#### APIs (Minimum)

* Create Tweet
* Get Timeline (returns all tweets visible to the authenticated user, newest first)

Authentication can be mocked (e.g., `userId` in request headers).

---

### Technical Constraints

* **Node.js + TypeScript**
* Framework, database, and ORM are up to you
* No frontend required

---

### Deliverables

* Source code
* README briefly explaining:

  * Multi-tenant approach
  * ACL logic
  * Department hierarchy handling

---

### Time Expectation

⏱ **~2 hours**
Focus on correctness and clarity over completeness.

----

# バックエンド Take-Home 課題

## エンタープライズ Twitter（マルチテナント）

### 問題

**エンタープライズ向け Twitter 風アプリケーション**のバックエンドサービスを構築してください。

**単一のバックエンドシステム**で**複数の企業（テナント）**をサポートする必要があります。  
ユーザーは短いメッセージ（「ツイート」）を投稿でき、ツイートは**同一企業内のみ**で閲覧可能とし、任意で部署単位のアクセス制御を行います。

---

### 要件

#### マルチテナンシー

* 1つのバックエンドで複数企業をサポートすること
* 各リクエストは `companyId` に紐づいていること
* ユーザーは他社のデータを**決して**閲覧できてはならない

---

#### ユーザー & 部署

* ユーザーは **1つの企業** に所属する
* ユーザーは **複数の部署** に所属できる
* 部署は以下の特性を持つ：

  * 1つの企業に所属する
  * 階層構造（親部署 → 子部署）を持つ

---

#### ツイート

各ツイートは以下の情報を持つ：

* 投稿者
* 企業
* 内容
* 公開範囲（Visibility type）
* 作成日時

公開範囲の種類：

* **COMPANY** – 同一企業内のすべてのユーザーに公開
* **DEPARTMENTS** – 指定された部署に所属するユーザーのみに公開
* **DEPARTMENTS_AND_SUBDEPARTMENTS** – 指定された部署およびその配下の部署に所属するユーザーに公開

1つのツイートは **複数の部署** を対象に指定できます。

---

#### アクセス制御

ユーザーがツイートを閲覧できるのは、以下を **すべて** 満たす場合のみとします：

* ツイートが同一企業に属している
* ユーザーの部署所属状況が、ツイートの公開範囲ルールを満たしている

---

#### API（最低限）

* ツイート作成
* タイムライン取得（認証されたユーザーが閲覧可能なすべてのツイートを、新しい順で返す）

認証は簡易的なもので構いません（例：リクエストヘッダーで `userId` を渡す）。

---

### 技術的制約

* **Node.js + TypeScript**
* フレームワーク、データベース、ORM の選択は自由
* フロントエンドの実装は不要

---

### 提出物

* ソースコード
* 以下を簡潔に説明した README：

  * マルチテナントの設計方針
  * ACL（アクセス制御）の実装方法
  * 部署階層の扱い方

---

### 想定作業時間

⏱ **約2時間**  
完成度よりも、**正しさと分かりやすさ**を重視してください。
