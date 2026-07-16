Ye lo meri jaan, poora API documentation contract ek sath, bina kisi emoji ke aur bilkul clean format mein.

Maine isme har endpoint ke sath **Code Comments (`// Explanation`)** add kar diye hain jo tumhare partner ko ghr ja kar testing karne mein madad karenge ke kaunsi cheez kyun ho rahi hai aur kaise request bhejni hai.

Isko seedha copy-paste kar lo:

```markdown
# VALOIR SYSTEM ARCHITECTURE AND API TESTING CONTRACT

This document serves as the absolute technical reference manual for the Valoir platform backend integrations. It outlines database schemas and query structures directly mapping to the Supabase PostgreSQL instance.

---

## 1. DATABASE SCHEMA REFERENCE

### 1.1 Profiles Table (`profiles`)
// EXPLANATION: Users register here. This table stores identity metadata and spatial geographic locations.
// Every authenticated user must have an entry here to complete their setup.

* `id` (UUID, Primary Key): References the Supabase internal auth uid.
* `name` (VARCHAR): User's legal or professional name.
* `email` (VARCHAR): Unique email tracking vector.
* `location` (TEXT): Suburb, district, or municipal center.
* `bio` (TEXT): Core competencies listed for skill routing.

### 1.2 Listings Table (`listings`)
// EXPLANATION: Represents individual exchange cards. A card is either an 'offer' (skills a user teaches) 
// or a 'request' (skills a user wants to acquire).

* `id` (UUID, Primary Key): Unique string generated natively by PostgreSQL.
* `user_id` (UUID, Foreign Key): Identifies the owner profile creating the card.
* `type` (VARCHAR): Strict check constraint restricting parameters to ['offer', 'request'].
* `title` (VARCHAR): Concise skill identifier string.
* `category` (VARCHAR): Main group index (e.g., Technology, Music, Cooking).
* `description` (TEXT): Explicit terms regarding the desired or offered exchange.
* `radius_km` (INTEGER): Geofence distance parameter (1 km to 100 km).
* `created_at` (TIMESTAMPTZ): Chronological index tracking creation time.

### 1.3 Messages Table (`messages`)
// EXPLANATION: Serves as the localized real-time ledger for conversations. 
// It bridges two users together over a specific listing context.

* `id` (BIGSERIAL, Primary Key): Automated incremental sequence tracking transaction logs.
* `sender_id` (UUID, Foreign Key): Profile reference initiating the text packet.
* `receiver_id` (UUID, Foreign Key): Profile reference receiving the text packet.
* `listing_id` (UUID, Foreign Key): Links the chat to the specific skill card context.
* `content` (TEXT): Raw text content containing exchange conditions.
* `timestamp` (TIMESTAMPTZ): Strict clock time marking communication delivery.

---

## 2. API TESTING MAPPING & DISPATCH RULES

### 2.1 Profile Initialization Layer

#### UPDATE PROFILE DATA (`UPSERT`)
// TESTING EXPLANATION: Run this query during the onboarding check if the user is missing a location/bio string.
// It inserts new rows or overrides mismatched keys safely based on user ID signature.

* **Target Storage Unit:** `profiles`
* **Data Schema Contract:**
```json
{
  "id": "4a2c8e3d-1a8b-5c4d-9e2f-0b1a7d3c5e6f", // Required: UUID from active session
  "location": "Rawalpindi, Punjab",             // Required: Target operating sector
  "bio": "Expert JavaScript engineer."           // Required: Core domain listing
}

```

---

### 2.2 Skill Catalog Controller

#### FETCH AGGREGATED CATALOG RECORDS (`SELECT`)

// TESTING EXPLANATION: Fetches active cards matching the dashboard filters.
// It aggregates data across tables via relational joins, returning individual skill metrics along with owner attributes.

* **Target Storage Unit:** `listings`
* **Relational Query Conditions:** Performs a `left-join` on `profiles` matching `user_id`.
* **Execution Logic Matrix:**
* If `category` !== "All", filters column matching parameter string.
* If `type` !== "All", filters column matching parameter string.
* If `searchQuery` length > 0, fires pattern matching query: `title.ilike.%query%`


* **Response Payload Structure:**

```json
[
  {
    "id": "7f8e9d0a-1b2c-3d4e-5f6a-7b8c9d0a1b2c",
    "user_id": "4a2c8e3d-1a8b-5c4d-9e2f-0b1a7d3c5e6f",
    "type": "offer",
    "title": "Fullstack Architecture Mentorship",
    "category": "Technology",
    "description": "Offering 1-on-1 systems engineering in return for linguistic arts training.",
    "radius_km": 15,
    "created_at": "2026-07-16T16:19:00Z",
    "profiles": {
      "name": "Hashir Javed",
      "location": "Rawalpindi, Punjab"
    }
  }
]

```

#### INSERT EXCHANGE ENTRY (`INSERT`)

// TESTING EXPLANATION: Execute this call when a member completes the 'Publish Card' form interface.
// Populates the global marketplace matrix under automated indexing constraints.

* **Target Storage Unit:** `listings`
* **Data Schema Contract:**

```json
{
  "user_id": "4a2c8e3d-1a8b-5c4d-9e2f-0b1a7d3c5e6f", // Session author signature
  "type": "offer",                                   // Direction parameter: offer OR request
  "title": "Advanced Logic Tuning",                  // Target title string
  "category": "Technology",                          // Validated system category string
  "description": "Deep database partitioning design",// Detailed criteria specifier
  "radius_km": 25                                    // Functional range limit integer
}

```

#### REMOVE CARD ROW (`DELETE`)

// TESTING EXPLANATION: Invoked when a user terminates their own active card from the registry.
// Row-Level Security (RLS) policies on Supabase will terminate the request if unauthorized tokens try this.

* **Target Storage Unit:** `listings`
* **Operational Parameter Filter:** Where `id` MATCHES target listing UUID structure.

---

### 2.3 Ledger Communication Engine

#### FETCH SYSTEM INBOX TRANSTRIPTS (`SELECT`)

// TESTING EXPLANATION: Loads complete active inbox items for the dashboard view.
// Returns text sequences where the user is either the author or the designated recipient node.

* **Target Storage Unit:** `messages`
* **Query Filter Matrix:** Evaluates logical condition: `(sender_id == CURRENT_USER OR receiver_id == CURRENT_USER)`
* **Sorting Policy:** Enforces `timestamp` ordering in descending format to surface active threads.

#### PUSH LIVE TRANSACTION MESSAGE (`INSERT`)

// TESTING EXPLANATION: Transmits a conversation unit inside a specific thread channel.
// This registers a permanent data trace in the tracking ledger and pushes a state notification across active network nodes.

* **Target Storage Unit:** `messages`
* **Data Schema Contract:**

```json
{
  "sender_id": "4a2c8e3d-1a8b-5c4d-9e2f-0b1a7d3c5e6f",   // Origin author user ID
  "receiver_id": "8f7e6d5c-4b3a-2a1a-0b9c-8d7e6f5a4b3c",   // Target destination user ID
  "listing_id": "7f8e9d0a-1b2c-3d4e-5f6a-7b8c9d0a1b2c",   // Contextual listing card reference ID
  "content": "Agreement confirmed. Initiating offline meeting arrangements." // Payload content text string
}

```

#### STREAM THREAD TRANSCRIPT (`SELECT`)

// TESTING EXPLANATION: Loads the isolated history array for a dedicated conversation component.
// Fetches structured message rows sequentially between the target pair for that one card node.

* **Target Storage Unit:** `messages`
* **Query Filter Matrix:** Evaluates strict logical condition: `AND ((sender_id == CURRENT_USER AND receiver_id == TARGET_USER) OR (sender_id == TARGET_USER AND receiver_id == CURRENT_USER)) AND listing_id == CHAT_LISTING_CONTEXT_ID`
* **Sorting Policy:** Enforces `timestamp` ordering in ascending format to stream messages linearly from past to present.

```

```