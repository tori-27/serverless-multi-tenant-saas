"""
Noisy Neighbor Test Results Visualization
Reads k6 JSON output and creates charts
"""

import json
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from collections import defaultdict
import sys

# Set style
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.labelsize'] = 12

def parse_k6_json(filename):
    """Parse k6 JSON output and extract metrics"""
    metrics = defaultdict(lambda: {'total': 0, 'throttled': 0})
    
    with open(filename, 'r') as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get('type') == 'Point' and data.get('metric'):
                    metric_name = data['metric']
                    value = data.get('data', {}).get('value', 0)
                    
                    # Extract counter metrics
                    if 'requests' in metric_name or 'throttled' in metric_name:
                        metrics[metric_name]['total'] = value
            except json.JSONDecodeError:
                continue
    
    return metrics

def create_noisy_neighbor_chart():
    """Create Noisy Neighbor test visualization from test results"""
    
    # Data from test output (captured from console)
    scenarios = {
        'Scenario 1:\nBASIC → STANDARD': {
            'noisy': {'name': 'BasicCorp', 'tier': 'BASIC', 'requests': 7302, 'throttled': 7055, 'rate': 96.62},
            'victim': {'name': 'StandardCorp', 'tier': 'STANDARD', 'requests': 198, 'throttled': 0, 'rate': 0.0}
        },
        'Scenario 2:\nBASIC → PLATINUM': {
            'noisy': {'name': 'BasicCorp', 'tier': 'BASIC', 'requests': 7217, 'throttled': 6964, 'rate': 96.49},
            'victim': {'name': 'PlatinumCorp', 'tier': 'PLATINUM', 'requests': 184, 'throttled': 0, 'rate': 0.0}
        },
        'Scenario 3:\nPREMIUM → PREMIUM': {
            'noisy': {'name': 'PremiumNoisy', 'tier': 'PREMIUM', 'requests': 1136, 'throttled': 0, 'rate': 0.0},
            'victim': {'name': 'PremiumCorp', 'tier': 'PREMIUM', 'requests': 201, 'throttled': 0, 'rate': 0.0}
        }
    }
    
    fig = plt.figure(figsize=(16, 10))
    
    # Create main title
    fig.suptitle('Noisy Neighbor Test: Multi-Tenant Rate Limiting Isolation', 
                 fontsize=18, fontweight='bold', y=0.98)
    
    # Create 2x2 grid
    gs = fig.add_gridspec(2, 2, hspace=0.35, wspace=0.25)
    
    # ============ Chart 1: Throttle Rate Comparison ============
    ax1 = fig.add_subplot(gs[0, 0])
    
    scenario_names = list(scenarios.keys())
    x = np.arange(len(scenario_names))
    width = 0.35
    
    noisy_rates = [scenarios[s]['noisy']['rate'] for s in scenario_names]
    victim_rates = [scenarios[s]['victim']['rate'] for s in scenario_names]
    
    bars1 = ax1.bar(x - width/2, noisy_rates, width, label='Noisy Tenant', 
                    color='#e74c3c', edgecolor='black', linewidth=1.2)
    bars2 = ax1.bar(x + width/2, victim_rates, width, label='Victim Tenant', 
                    color='#27ae60', edgecolor='black', linewidth=1.2)
    
    ax1.set_ylabel('Throttle Rate (%)', fontweight='bold')
    ax1.set_title('Throttle Rate: Noisy vs Victim Tenants', fontweight='bold', pad=10)
    ax1.set_xticks(x)
    ax1.set_xticklabels(scenario_names, fontsize=10)
    ax1.legend(loc='upper right')
    ax1.set_ylim(0, 110)
    ax1.axhline(y=50, color='orange', linestyle='--', alpha=0.5, label='50% threshold')
    
    # Add value labels
    for bar in bars1:
        height = bar.get_height()
        ax1.annotate(f'{height:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold', fontsize=10)
    for bar in bars2:
        height = bar.get_height()
        ax1.annotate(f'{height:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold', fontsize=10,
                    color='#27ae60')
    
    # ============ Chart 2: Request Volume ============
    ax2 = fig.add_subplot(gs[0, 1])
    
    noisy_requests = [scenarios[s]['noisy']['requests'] for s in scenario_names]
    victim_requests = [scenarios[s]['victim']['requests'] for s in scenario_names]
    
    bars3 = ax2.bar(x - width/2, noisy_requests, width, label='Noisy Tenant', 
                    color='#e74c3c', edgecolor='black', linewidth=1.2, alpha=0.8)
    bars4 = ax2.bar(x + width/2, victim_requests, width, label='Victim Tenant', 
                    color='#27ae60', edgecolor='black', linewidth=1.2, alpha=0.8)
    
    ax2.set_ylabel('Total Requests', fontweight='bold')
    ax2.set_title('Request Volume per Scenario', fontweight='bold', pad=10)
    ax2.set_xticks(x)
    ax2.set_xticklabels(scenario_names, fontsize=10)
    ax2.legend(loc='upper right')
    
    for bar in bars3:
        height = bar.get_height()
        ax2.annotate(f'{int(height)}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points",
                    ha='center', va='bottom', fontsize=9)
    for bar in bars4:
        height = bar.get_height()
        ax2.annotate(f'{int(height)}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points",
                    ha='center', va='bottom', fontsize=9)
    
    # ============ Chart 3: Stacked Success/Throttled ============
    ax3 = fig.add_subplot(gs[1, 0])
    
    tenants = ['BASIC\n(Noisy 1)', 'BASIC\n(Noisy 2)', 'STANDARD\n(Victim)', 
               'PLATINUM\n(Victim)', 'PREMIUM\n(Noisy)', 'PREMIUM\n(Victim)']
    successful = [7302-7055, 7217-6964, 198, 184, 1136, 201]
    throttled = [7055, 6964, 0, 0, 0, 0]
    
    x3 = np.arange(len(tenants))
    
    bars_success = ax3.bar(x3, successful, label='Successful (200)', 
                           color='#27ae60', edgecolor='black', linewidth=1)
    bars_throttle = ax3.bar(x3, throttled, bottom=successful, label='Throttled (429)', 
                            color='#e74c3c', edgecolor='black', linewidth=1)
    
    ax3.set_ylabel('Requests', fontweight='bold')
    ax3.set_title('Request Breakdown: Success vs Throttled', fontweight='bold', pad=10)
    ax3.set_xticks(x3)
    ax3.set_xticklabels(tenants, fontsize=9)
    ax3.legend(loc='upper right')
    
    # ============ Chart 4: Isolation Summary ============
    ax4 = fig.add_subplot(gs[1, 1])
    
    # Create a summary table-like visualization
    isolation_data = {
        'BASIC → STANDARD': ('ISOLATED', '#27ae60', 'Different tier Usage Plans'),
        'BASIC → PLATINUM': ('ISOLATED', '#27ae60', 'Dedicated PLATINUM Usage Plan'),
        'PREMIUM → PREMIUM': ('ISOLATED', '#27ae60', 'Per-tenant Usage Plans')
    }
    
    ax4.set_xlim(0, 10)
    ax4.set_ylim(0, 10)
    ax4.axis('off')
    
    # Title
    ax4.text(5, 9.5, 'Tenant Isolation Summary', fontsize=14, fontweight='bold', 
             ha='center', va='top')
    
    y_pos = 8
    for scenario, (status, color, explanation) in isolation_data.items():
        # Scenario name
        ax4.text(0.5, y_pos, scenario, fontsize=11, fontweight='bold', va='center')
        # Status badge
        bbox_props = dict(boxstyle="round,pad=0.3", facecolor=color, alpha=0.3, edgecolor=color)
        ax4.text(5.5, y_pos, status, fontsize=11, fontweight='bold', va='center', 
                bbox=bbox_props, color=color)
        # Explanation
        ax4.text(0.5, y_pos - 0.6, explanation, fontsize=9, va='center', 
                style='italic', color='gray')
        y_pos -= 2
    
    # Add key findings box
    findings_text = """Key Findings:
• BASIC noisy tenant throttled at ~96% - rate limiting works
• All victim tenants: 0% throttled - complete isolation
• PREMIUM per-tenant limits provide individual isolation
• PLATINUM dedicated limits prevent cross-tier impact"""
    
    ax4.text(0.5, 1.5, findings_text, fontsize=10, va='top', 
            bbox=dict(boxstyle='round', facecolor='#f8f9fa', edgecolor='#dee2e6'),
            family='monospace')
    
    plt.tight_layout()
    plt.savefig('noisy-neighbor-results.png', dpi=150, bbox_inches='tight', 
                facecolor='white', edgecolor='none')
    print("Saved: noisy-neighbor-results.png")
    plt.close()

if __name__ == '__main__':
    create_noisy_neighbor_chart()
