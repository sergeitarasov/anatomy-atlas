#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
version=3.9.9
maven_dir="$PWD/.tools/apache-maven-$version"
if [[ ! -x "$maven_dir/bin/mvn" ]]; then
  mkdir -p .tools
  archive="$PWD/.tools/maven.tar.gz"
  curl --fail --location --retry 3 "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/apache-maven-$version-bin.tar.gz" -o "$archive"
  expected=a555254d6b53d267965a3404ecb14e53c3827c09c3b94b5678835887ab404556bfaf78dcfe03ba76fa2508649dca8531c74bca4d5846513522404d48e8c4ac8b
  actual=$(shasum -a 512 "$archive" | cut -d ' ' -f 1)
  [[ "$actual" == "$expected" ]] || { echo 'Maven checksum mismatch.' >&2; exit 1; }
  tar -xzf "$archive" -C .tools
  rm "$archive"
fi
exec "$maven_dir/bin/mvn" "-Dmaven.repo.local=$PWD/.cache/m2" "$@"
