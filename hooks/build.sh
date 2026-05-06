#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun install
mkdir -p bin

# We ship a thin bash wrapper rather than `bun build --compile`. Reason:
# Bun's compiled binary embeds a self-extracting blob *after* the LINKEDIT
# segment, which macOS's codesign tool refuses to sign ("invalid or
# unsupported format for signature"). On Apple Silicon, an unsigned binary
# is killed on launch — the fledge host then sees EPIPE while writing the
# init message. Since `bun install` is already required at install time,
# requiring `bun` at runtime is not a new dependency.
cat > bin/fledge-algochat <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
PLUGIN_DIR="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
exec bun run "$PLUGIN_DIR/src/index.ts" "$@"
EOF
chmod +x bin/fledge-algochat
