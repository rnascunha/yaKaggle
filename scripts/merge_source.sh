#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Allowed file extensions to merge (with or without leading dot)
ALLOWED_EXTENSIONS=("js" "ts" "json")

# Names of directories, files, or patterns to ignore during traversal
IGNORED_PATTERNS=("__pycache__" ".git" ".venv" "venv" "node_modules" ".pytest_cache")

# Default output file name if none is passed via -o / --output
DEFAULT_OUTPUT_FILE="merged_sources.txt"

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

print_usage() {
  cat << EOF
Usage: $(basename "$0") [-o <output_file>] <directory1> [directory2 ...]

Description:
  Recursively traverses the specified directories and merges files matching
  the configured allowed extensions into a single destination file.

Options:
  -o, --output <file>   Specify the output file name (default: '${DEFAULT_OUTPUT_FILE}')
  -h, --help            Show this help message and exit

Arguments:
  <directory>           One or more valid directory paths to process.

Exit Codes:
  0 - Success
  1 - Missing arguments or unknown options
  2 - Invalid or non-existent directory provided
EOF
}

# Resolve canonical absolute path portably across Linux and macOS
get_abs_path() {
  if command -v realpath > /dev/null 2>&1; then
    realpath "$1"
  else
    python3 -c "import os, sys; print(os.path.realpath(sys.argv[1]))" "$1" 2> /dev/null \
      || (cd "$(dirname "$1")" 2> /dev/null && echo "$(pwd -P)/$(basename "$1")")
  fi
}

# ==============================================================================
# ARGUMENT PARSING & VALIDATION
# ==============================================================================

OUTPUT_FILE="$DEFAULT_OUTPUT_FILE"
DIRECTORIES=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -o | --output)
      if [ -z "${2:-}" ]; then
        echo "Error: Option '$1' requires a file path argument." >&2
        print_usage >&2
        exit 1
      fi
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --output=*)
      OUTPUT_FILE="${1#*=}"
      shift
      ;;
    -h | --help)
      print_usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        DIRECTORIES+=("$1")
        shift
      done
      break
      ;;
    -*)
      echo "Error: Unknown option '$1'." >&2
      print_usage >&2
      exit 1
      ;;
    *)
      DIRECTORIES+=("$1")
      shift
      ;;
  esac
done

if [ "${#DIRECTORIES[@]}" -eq 0 ]; then
  echo "Error: No directory paths provided." >&2
  print_usage >&2
  exit 1
fi

for dir_arg in "${DIRECTORIES[@]}"; do
  if [ ! -e "$dir_arg" ]; then
    echo "Error: Target path '$dir_arg' does not exist." >&2
    exit 2
  fi

  if [ ! -d "$dir_arg" ]; then
    echo "Error: Target path '$dir_arg' is not a directory." >&2
    exit 2
  fi
done

# ==============================================================================
# FILE MERGING LOGIC
# ==============================================================================

# Ensure target directory for output file exists and initialize it
out_dir="$(dirname "$OUTPUT_FILE")"
if [ ! -d "$out_dir" ]; then
  mkdir -p "$out_dir"
fi

touch "$OUTPUT_FILE"
ABS_OUTPUT_FILE="$(get_abs_path "$OUTPUT_FILE")"
> "$OUTPUT_FILE" # Empty any prior contents

# Build `find` arguments for ignored paths
ignore_args=()
for pattern in "${IGNORED_PATTERNS[@]}"; do
  if [ ${#ignore_args[@]} -gt 0 ]; then
    ignore_args+=("-o")
  fi
  ignore_args+=("-name" "$pattern")
done

# Build `find` arguments for allowed file extensions
ext_args=()
for ext in "${ALLOWED_EXTENSIONS[@]}"; do
  clean_ext="${ext#.}"
  if [ ${#ext_args[@]} -gt 0 ]; then
    ext_args+=("-o")
  fi
  ext_args+=("-name" "*.$clean_ext")
done

processed_count=0

for target_dir in "${DIRECTORIES[@]}"; do
  # Strip trailing slashes from target directory input
  clean_dir="$target_dir"
  while [ "$clean_dir" != "/" ] && [ "${clean_dir%"/"}" != "$clean_dir" ]; do
    clean_dir="${clean_dir%"/"}"
  done

  # If the user passed an absolute path, keep the base folder name for relative display
  if [[ "$clean_dir" == /* ]] && [ "$clean_dir" != "/" ]; then
    dir_base="$(basename "$clean_dir")"
  else
    dir_base=""
  fi

  while IFS= read -r -d '' file_path; do
    abs_file="$(get_abs_path "$file_path")"

    # Prevent the output file from merging into itself
    if [ "$abs_file" = "$ABS_OUTPUT_FILE" ]; then
      continue
    fi

    # Format relative display path (e.g., src/run.py)
    if [ -n "$dir_base" ]; then
      rel_sub="${file_path#"$clean_dir"}"
      rel_sub="${rel_sub#/}"
      if [ -n "$rel_sub" ]; then
        display_path="${dir_base}/${rel_sub}"
      else
        display_path="${dir_base}"
      fi
    else
      # Strip redundant leading './' if present
      display_path="${file_path#./}"
    fi

    # Write header comment and contents
    {
      echo "################################################################################"
      echo "# FILE: ${display_path}"
      echo "################################################################################"
      cat "$file_path"
      echo ""
    } >> "$OUTPUT_FILE"

    processed_count=$((processed_count + 1))
  done < <(
    if [ ${#ignore_args[@]} -gt 0 ]; then
      find "$clean_dir" \
        \( \( "${ignore_args[@]}" \) -prune \) -o \
        \( -type f \( "${ext_args[@]}" \) -print0 \)
    else
      find "$clean_dir" -type f \( "${ext_args[@]}" \) -print0
    fi
  )
done

{
  echo "################################################################################"
  echo "# FILE: package.json"
  echo "################################################################################"
  cat package.json
  echo ""
} >> "$OUTPUT_FILE"

echo "Done: Merged ${processed_count} files into '${OUTPUT_FILE}'."
