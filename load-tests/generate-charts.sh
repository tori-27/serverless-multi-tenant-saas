#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate

echo "Generovanie grafov..."
python visualize_scenario1.py
python visualize_scenario2.py
python visualize_scenario3.py
python visualize_summary.py

echo ""
echo "Vytvorené súbory:"
ls -la scenario*.png summary*.png 2>/dev/null
