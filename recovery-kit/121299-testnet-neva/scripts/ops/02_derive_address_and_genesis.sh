#!/bin/bash
# Derive Ethereum address dari nodekey1/2/3 (validator) + faucet_key, derive pubkey dari
# ke-4 node (3 validator + rpc1), lalu:
#   - isi genesis.json (extraData QBFT 3 validator + faucet alloc) dari genesis.json.template
#   - copy genesis.json yang sama ke validator1/2/3 dan rpc1
#   - generate static-nodes.json per node (mesh: tiap node point ke 3 node lainnya)
# Butuh: docker, python3.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
KEY_DIR="$ROOT_DIR/keys"
GENESIS_TEMPLATE="$ROOT_DIR/config/genesis.json.template"

for NAME in nodekey1 nodekey2 nodekey3 nodekey_rpc1 faucet_key; do
  if [ ! -f "$KEY_DIR/$NAME" ]; then
    echo "ERROR: $KEY_DIR/$NAME belum ada. Jalankan 01_generate_node_key.sh dulu."
    exit 1
  fi
done

BESU_IMAGE=${BESU_IMAGE:-hyperledger/besu:26.6.0-RC1}
echo "=== Deriving addresses & public keys (image: $BESU_IMAGE) ==="
docker pull "$BESU_IMAGE" -q

derive_addr() {
  local KEY_FILE; KEY_FILE=$(realpath "$1")
  docker run --rm -v "$KEY_FILE:/data/key:ro" "$BESU_IMAGE" \
    public-key export-address --node-private-key-file=/data/key 2>/dev/null \
    | grep -oiE '0x[0-9a-fA-F]{40}' | head -1
}
derive_pub() {
  local KEY_FILE; KEY_FILE=$(realpath "$1")
  docker run --rm -v "$KEY_FILE:/data/key:ro" "$BESU_IMAGE" \
    public-key export --node-private-key-file=/data/key 2>/dev/null \
    | grep -oiE '0x[0-9a-fA-F]{128}' | head -1
}

ADDR1=$(derive_addr "$KEY_DIR/nodekey1"); PUB1=$(derive_pub "$KEY_DIR/nodekey1")
ADDR2=$(derive_addr "$KEY_DIR/nodekey2"); PUB2=$(derive_pub "$KEY_DIR/nodekey2")
ADDR3=$(derive_addr "$KEY_DIR/nodekey3"); PUB3=$(derive_pub "$KEY_DIR/nodekey3")
PUB_RPC1=$(derive_pub "$KEY_DIR/nodekey_rpc1")
FAUCET_ADDR=$(derive_addr "$KEY_DIR/faucet_key")

echo "Validator1: $ADDR1"
echo "Validator2: $ADDR2"
echo "Validator3: $ADDR3"
echo "Faucet:     $FAUCET_ADDR"

A1="${ADDR1#0x}"; A2="${ADDR2#0x}"; A3="${ADDR3#0x}"; FA="${FAUCET_ADDR#0x}"

# QBFT extraData dengan 3 validator (RLP: [vanity(32 zero bytes), [v1,v2,v3], seals=[], round=0, commitSeals=[]])
EXTRA=$(python3 << PYEOF
def rlp_item(x):
    if isinstance(x, bytes):
        if len(x) == 1 and x[0] < 0x80:
            return x
        n = len(x)
        if n < 56:
            return bytes([0x80 + n]) + x
        bl = n.to_bytes((n.bit_length()+7)//8,'big')
        return bytes([0xb7+len(bl)]) + bl + x
    elif isinstance(x, int):
        if x == 0: return b'\\x80'
        b = x.to_bytes((x.bit_length()+7)//8,'big')
        return rlp_item(b)
    elif isinstance(x, list):
        enc = b''.join(rlp_item(i) for i in x)
        n = len(enc)
        if n < 56:
            return bytes([0xc0+n]) + enc
        bl = n.to_bytes((n.bit_length()+7)//8,'big')
        return bytes([0xf7+len(bl)]) + bl + enc

validators = [bytes.fromhex("$A1"), bytes.fromhex("$A2"), bytes.fromhex("$A3")]
extra = rlp_item([b'\\x00' * 32, validators, [], 0, []])
print("0x" + extra.hex())
PYEOF
)
echo ""
echo "QBFT extraData (3 validator): $EXTRA"

TIMESTAMP=$(printf '0x%x' "$(date +%s)")
echo "Genesis timestamp: $TIMESTAMP (WAJIB non-zero — lihat docs/03_setup_validators.md incident note di root repo)"

GENESIS_TMP=$(mktemp)
cp "$GENESIS_TEMPLATE" "$GENESIS_TMP"
sed -i "s|__EXTRA_DATA__|$EXTRA|g" "$GENESIS_TMP"
sed -i "s|__FAUCET_ADDRESS__|$FA|g" "$GENESIS_TMP"
sed -i "s|__TIMESTAMP__|$TIMESTAMP|g" "$GENESIS_TMP"
python3 -m json.tool "$GENESIS_TMP" > /dev/null && echo "Genesis JSON valid"

for NODE in validator1 validator2 validator3 rpc1; do
  cp "$GENESIS_TMP" "$ROOT_DIR/$NODE/config/genesis.json"
done
rm -f "$GENESIS_TMP"
echo "genesis.json disalin ke validator1/2/3 dan rpc1"

# Static-nodes mesh: tiap node dial ke 3 node lainnya via 127.0.0.1 (1 server yang sama)
cat > "$ROOT_DIR/validator1/config/static-nodes.json" << EOF
["enode://${PUB2}@127.0.0.1:30304","enode://${PUB3}@127.0.0.1:30305","enode://${PUB_RPC1}@127.0.0.1:30306"]
EOF
cat > "$ROOT_DIR/validator2/config/static-nodes.json" << EOF
["enode://${PUB1}@127.0.0.1:30303","enode://${PUB3}@127.0.0.1:30305","enode://${PUB_RPC1}@127.0.0.1:30306"]
EOF
cat > "$ROOT_DIR/validator3/config/static-nodes.json" << EOF
["enode://${PUB1}@127.0.0.1:30303","enode://${PUB2}@127.0.0.1:30304","enode://${PUB_RPC1}@127.0.0.1:30306"]
EOF
cat > "$ROOT_DIR/rpc1/config/static-nodes.json" << EOF
["enode://${PUB1}@127.0.0.1:30303","enode://${PUB2}@127.0.0.1:30304","enode://${PUB3}@127.0.0.1:30305"]
EOF
echo "static-nodes.json (mesh) ditulis untuk validator1/2/3 dan rpc1"

cat > "$KEY_DIR/addresses.txt" << EOF
VALIDATOR1_ADDRESS=$ADDR1
VALIDATOR2_ADDRESS=$ADDR2
VALIDATOR3_ADDRESS=$ADDR3
FAUCET_ADDRESS=$FAUCET_ADDR
EXTRA_DATA=$EXTRA
GENESIS_TIMESTAMP=$TIMESTAMP
EOF
echo ""
echo "Addresses tersimpan di $KEY_DIR/addresses.txt (isi ini juga ke CREDENTIALS.txt)"
echo ""
echo "NEXT: isi .env di tiap node (validator1/2/3, rpc1), isi host-allowlist di"
echo "      rpc1/config/config.toml, lalu 03_first_deploy.sh"
