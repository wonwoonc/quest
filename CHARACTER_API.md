# Character API — temporary development-only Genspark provider

## Enable explicitly

```sh
NODE_ENV=development QUEST_DEV_IMAGE_GENERATION=1 npm run dev
```

Disabled by default; `NODE_ENV=production` always disables generation, even with
the flag. The server uses the already authenticated server-side `gsk` installation;
no credentials are accepted from or delivered to the browser. No login/config
files are read by the application. Do not expose this development service publicly.

On startup, the server prints `Quest dev image access code: …`. This is a new
random application-only code, not a provider credential. Enter it in the separate
password field, check the paid-generation consent, then choose/capture a photo.
The client retains the code in a closure only (not storage, profile, backup or
URL); reload clears it. Server restart rotates the code and resets the budget.
PM2 operators should supply these environment variables when restarting with
`--update-env`, then obtain the new code from that process's startup logs.

## HTTP contract and guards

- `GET /api/characters`: public, no-store readiness, version 1, `configured`,
  `requiresCode`; enabled readiness also reports attempts remaining and credit-stop
  state. Readiness means the dev gate is enabled, not that provider credits or
  authentication have been live-tested. Never returns the code.
- `POST`: same origin required, including multipart. Missing Origin, different
  Origin or cross-site fetch metadata is rejected. Forwarded host/proto headers
  are deliberately not trusted. Reverse proxies must preserve the actual origin
  and Host/TLS relationship; mismatches fail closed rather than bypassing CSRF.
- Header `X-Quest-Dev-Code`: SHA-256 digests compared with `timingSafeEqual`.
  Query-string codes are never accepted. No permissive CORS or preflight support.
- Multipart fields exactly one `photo` and one `options`. Options must contain
  `version:1`, `consent:true`, six-digit hex `color`, `avatarStyle:'fullbody'`.
  Client-provided policy cannot override the server prompt/model/reference.
- Complete request body maximum **6 MiB**, including multipart overhead. Declared
  size checked before reading; chunked bodies counted while streaming. Upload
  read deadline 15 seconds. Client reserves 16 KiB for multipart overhead.
- JPEG/PNG/WebP only, nonempty, MIME matched against magic/header checks. This is
  format sniffing, not full image decoding or a guarantee against malformed images.
- One request in flight, minimum 30 seconds between provider attempts, maximum
  **5 attempts per process session** including failed calls. Invalid requests do
  not invoke the provider. No automatic retry. Credit/quota/membership refusals
  stop further generation for that process session.

## Provider execution and output

CLI help was inspected: local files and multiple inputs via `-i`, JSON stdout and
`-o` local output are supported. Uses `execFile`, no shell:

```text
gsk image_generation <server prompt> -i <actual temporary user photo> <style reference>
  -m nano-banana-2-flash-lite -r 1:1 -o <temporary output>
```

The authoritative approved style reference is
`https://www.genspark.ai/api/files/s/p8jwqX27?cache_control=3600`, **not** the
identity or clothing source. Client policy and server prompt share the same
version 1 policy: full-body MapleStory-inspired chibi, head 55-60% of total
character height, tiny compact torso, short legs and arms, tiny shoes, smooth 2D
curves, dark outlines, soft cel shading and anti-aliasing on a white square
background. No pixels/pixel art, dithering, stair steps, 3D or adult proportions.
Image 1 is the actual photo and the only identity/hair/face/clothing source, best
effort. Image 2 is STYLE ONLY: never copy its person, hair, hoodie or outfit.
Visible photo clothes are used when appropriate; hidden clothes default to a
modest selected-color casual T-shirt, long pants and sneakers. The reference's
gray/dark outfit is never forced. Request policy fields cannot override this.

Execution deadline 180 seconds, SIGKILL on timeout, stdout/stderr buffers capped
at 1 MiB each. Raw subprocess output/errors/commands never reach the browser or
application logs. Only fixed error codes are returned. CLI exit errors fail
closed, including save failures; never rerun generation automatically.

Success requires parseable JSON `generated_images` under `data` or at the root,
one successful entry, and a nonempty local raster output <=8 MiB with recognized
magic bytes. Return `{version:1, avatarStyle:'fullbody', image:'data:image/…;base64,…',
resultUrl?:'https://www.genspark.ai/api/files/s/…'}`. Optional permanent URL is
accepted only from that successful CLI entry and only on the exact platform
wrapper host/path with a strict alphanumeric/underscore/hyphen ID and optionally
one `?cache_control=<digits>` query. Other queries, duplicates, fragments,
credentials, ports, encoded paths and parser-normalized inputs are rejected;
accepted URLs are returned unchanged and displayed as an open/download link. No application fetch
of arbitrary provider URLs. Avatar bytes continue to use existing local media
storage and backups. Failed generation preserves the previous avatar.

Private per-request OS temp directory, input mode 0600, cleanup in `finally` on
success/failure. No original filename is used as a path. No photograph logging or
public static temp directory. SIGKILL/process crashes can prevent `finally`;
provider-side retention is outside this app's control. The CLI uploads references
to Genspark. The UI discloses approximate **19 credits/image**, upload consent,
and approximate identity, with https://www.genspark.ai/ai_image for region editing.
Exact pixel/identity preservation is not verifiable or guaranteed.

Static serving is restricted to dev entry HTML, src JS/HTML and the three named
dist pages. Dotfiles, scripts, config, logs, tests and symlink targets are denied.

## Verification and limitations

Tests inject CLI execution; no paid image generation is invoked. They cover
success/wrapped JSON, photo/reference order, gate/production override, auth/origin,
consent/type/magic/size (including chunked), rate/cap/concurrency, timeout,
credit-stop/failure sanitization, cleanup, static restrictions and client handling.
Actual credits, provider availability, schema and visual likeness remain untested
until the operator explicitly submits a real photo with consent.
