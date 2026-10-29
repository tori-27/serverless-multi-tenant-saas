"""
Generate English versions of the load test charts:
- crud_latency_by_tier.png
- scenario1_basic_standard.png
- scenario2_basic_platinum.png
- scenario3_premium_premium.png
"""

import json
import matplotlib.pyplot as plt
import numpy as np

plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.titlesize'] = 13
plt.rcParams['axes.labelsize'] = 11

TIERS = ['BASIC', 'STANDARD', 'PREMIUM', 'PLATINUM']
ALL_OPS = ['GET_LIST', 'GET_SINGLE', 'POST', 'PUT', 'DELETE']
OPERATION_NAMES = {
    'GET_LIST': 'GET /products',
    'GET_SINGLE': 'GET /{id}',
    'POST': 'POST',
    'PUT': 'PUT',
    'DELETE': 'DELETE'
}


def safe_val(results, tier, op, key, default=0):
    try:
        v = results[tier][op][key]
        return v if v and v > 0 else default
    except (KeyError, TypeError):
        return default


def get_available_ops(results):
    available = []
    for op in ALL_OPS:
        has_data = any(safe_val(results, tier, op, 'p95') > 0 for tier in TIERS)
        if has_data:
            available.append(op)
    return available if available else ALL_OPS


def load_results(filename='crud-latency-results.json'):
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
            print(f"Loaded results from {filename}")
            return data
    except FileNotFoundError:
        print(f"File {filename} not found. Using sample data.")
        return {
            "BASIC": {
                "GET_LIST": {"p50": 680, "p95": 1250, "p99": 1800, "avg": 780, "min": 450, "max": 2500},
                "GET_SINGLE": {"p50": 520, "p95": 950, "p99": 1400, "avg": 620, "min": 380, "max": 1800},
                "POST": {"p50": 620, "p95": 1100, "p99": 1600, "avg": 710, "min": 420, "max": 2200},
                "PUT": {"p50": 580, "p95": 1050, "p99": 1500, "avg": 670, "min": 400, "max": 2000},
                "DELETE": {"p50": 540, "p95": 980, "p99": 1350, "avg": 630, "min": 370, "max": 1700},
                "totalRequests": 300, "errorRate": 1.5
            },
            "STANDARD": {
                "GET_LIST": {"p50": 660, "p95": 1200, "p99": 1750, "avg": 750, "min": 430, "max": 2400},
                "GET_SINGLE": {"p50": 500, "p95": 920, "p99": 1350, "avg": 600, "min": 360, "max": 1750},
                "POST": {"p50": 600, "p95": 1080, "p99": 1550, "avg": 690, "min": 400, "max": 2100},
                "PUT": {"p50": 560, "p95": 1020, "p99": 1450, "avg": 650, "min": 380, "max": 1950},
                "DELETE": {"p50": 520, "p95": 950, "p99": 1300, "avg": 610, "min": 350, "max": 1650},
                "totalRequests": 300, "errorRate": 1.2
            },
            "PREMIUM": {
                "GET_LIST": {"p50": 650, "p95": 1180, "p99": 1700, "avg": 740, "min": 420, "max": 2350},
                "GET_SINGLE": {"p50": 490, "p95": 900, "p99": 1320, "avg": 580, "min": 350, "max": 1700},
                "POST": {"p50": 590, "p95": 1060, "p99": 1520, "avg": 680, "min": 390, "max": 2050},
                "PUT": {"p50": 550, "p95": 1000, "p99": 1420, "avg": 640, "min": 370, "max": 1900},
                "DELETE": {"p50": 510, "p95": 930, "p99": 1280, "avg": 600, "min": 340, "max": 1600},
                "totalRequests": 300, "errorRate": 0.8
            },
            "PLATINUM": {
                "GET_LIST": {"p50": 620, "p95": 1100, "p99": 1600, "avg": 700, "min": 400, "max": 2200},
                "GET_SINGLE": {"p50": 470, "p95": 850, "p99": 1250, "avg": 550, "min": 330, "max": 1600},
                "POST": {"p50": 560, "p95": 1000, "p99": 1440, "avg": 650, "min": 370, "max": 1950},
                "PUT": {"p50": 530, "p95": 960, "p99": 1380, "avg": 620, "min": 350, "max": 1850},
                "DELETE": {"p50": 490, "p95": 890, "p99": 1220, "avg": 580, "min": 320, "max": 1550},
                "totalRequests": 300, "errorRate": 0.5
            }
        }


def create_crud_latency_by_tier(results):
    """Chart: CRUD Operation Latency by Service Tier (crud_latency_by_tier.png)"""
    ops = get_available_ops(results)
    op_labels = [OPERATION_NAMES[op] for op in ops]

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('CRUD Operation Latency by Service Tier\n(p50, p95, p99 in milliseconds)',
                 fontsize=16, fontweight='bold')

    for idx, tier in enumerate(TIERS):
        ax = axes[idx // 2, idx % 2]
        x = np.arange(len(ops))
        width = 0.25

        p50_values = [safe_val(results, tier, op, 'p50') for op in ops]
        p95_values = [safe_val(results, tier, op, 'p95') for op in ops]
        p99_values = [safe_val(results, tier, op, 'p99') for op in ops]

        bars1 = ax.bar(x - width, p50_values, width, label='p50',
                       color='#A8C4E0', edgecolor='#333333', linewidth=0.5)
        bars2 = ax.bar(x, p95_values, width, label='p95',
                       color='#5B9BD5', edgecolor='#333333', linewidth=0.5)
        bars3 = ax.bar(x + width, p99_values, width, label='p99',
                       color='#2C5F8A', edgecolor='#333333', linewidth=0.5)

        infra_type = "Siloed (dedicated)" if tier == "PLATINUM" else "Pooled (shared)"
        total_req = results.get(tier, {}).get('totalRequests', 0)
        error_rate = results.get(tier, {}).get('errorRate', 0)

        ax.set_ylabel('Latency (ms)')
        ax.set_title(f'{tier} - {infra_type}\nRequests: {total_req}, Errors: {error_rate:.2f}%',
                     fontweight='bold', fontsize=11)
        ax.set_xticks(x)
        ax.set_xticklabels(op_labels, fontsize=9, rotation=15, ha='right')
        ax.legend(loc='upper right', fontsize=8)

        all_vals = p50_values + p95_values + p99_values
        max_val = max(v for v in all_vals if v > 0) if any(v > 0 for v in all_vals) else 100
        ax.set_ylim(0, max_val * 1.3)

        for bars in [bars1, bars2, bars3]:
            for bar in bars:
                height = bar.get_height()
                if height > 0:
                    ax.annotate(f'{height:.0f}',
                               xy=(bar.get_x() + bar.get_width() / 2, height),
                               xytext=(0, 2), textcoords="offset points",
                               ha='center', va='bottom', fontsize=7)

    plt.tight_layout()
    plt.savefig('crud_latency_by_tier.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Saved: crud_latency_by_tier.png")
    plt.close()


def create_scenario1():
    """Scenario 1: BASIC (noisy) -> STANDARD (victim)"""
    tenants = ['BasicCorp\n(noisy)', 'StandardCorp\n(victim)']
    throttle_rates = [68.89, 0.0]
    throttled = [248, 0]
    successful = [112, 145]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('Scenario 1: BASIC (noisy) \u2192 STANDARD (victim)\nThrottling by Tier',
                 fontsize=16, fontweight='bold')

    ax1 = axes[0]
    colors = ['#e74c3c', '#27ae60']
    bars = ax1.bar(tenants, throttle_rates, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Throttle Rate (%)', fontweight='bold')
    ax1.set_title('Request Throttle Rate', fontweight='bold')
    ax1.set_ylim(0, 100)

    for bar, rate in zip(bars, throttle_rates):
        ax1.annotate(f'{rate:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    xytext=(0, 5), textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold', fontsize=14)

    ax2 = axes[1]
    x = np.arange(len(tenants))
    width = 0.6

    ax2.bar(x, successful, width, label='Successful (200)',
            color='#27ae60', edgecolor='black')
    ax2.bar(x, throttled, width, bottom=successful,
            label='Throttled (429)', color='#e74c3c', edgecolor='black')

    ax2.set_ylabel('Number of Requests', fontweight='bold')
    ax2.set_title('Request Distribution', fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(tenants)
    ax2.legend(loc='upper right')

    for i, (s, t) in enumerate(zip(successful, throttled)):
        total = s + t
        ax2.annotate(f'{total}', xy=(i, total + 10), ha='center', fontweight='bold')

    plt.tight_layout()
    plt.savefig('scenario1_basic_standard.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Saved: scenario1_basic_standard.png")
    plt.close()


def create_scenario2():
    """Scenario 2: BASIC (noisy) -> PLATINUM (victim)"""
    tenants = ['BasicCorp\n(noisy)', 'PlatinumCorp\n(victim)']
    throttle_rates = [64.17, 0.0]
    throttled = [231, 0]
    successful = [129, 273]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('Scenario 2: BASIC (noisy) \u2192 PLATINUM (victim)\nDedicated Usage Plan for PLATINUM',
                 fontsize=16, fontweight='bold')

    ax1 = axes[0]
    colors = ['#e74c3c', '#27ae60']
    bars = ax1.bar(tenants, throttle_rates, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Throttle Rate (%)', fontweight='bold')
    ax1.set_title('Request Throttle Rate', fontweight='bold')
    ax1.set_ylim(0, 100)

    for bar, rate in zip(bars, throttle_rates):
        ax1.annotate(f'{rate:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    xytext=(0, 5), textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold', fontsize=14)

    ax2 = axes[1]
    x = np.arange(len(tenants))
    width = 0.6

    ax2.bar(x, successful, width, label='Successful (200)',
            color='#27ae60', edgecolor='black')
    ax2.bar(x, throttled, width, bottom=successful,
            label='Throttled (429)', color='#e74c3c', edgecolor='black')

    ax2.set_ylabel('Number of Requests', fontweight='bold')
    ax2.set_title('Request Distribution', fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(tenants)
    ax2.legend(loc='upper right')

    for i, (s, t) in enumerate(zip(successful, throttled)):
        total = s + t
        ax2.annotate(f'{total}', xy=(i, total + 10), ha='center', fontweight='bold')

    plt.tight_layout()
    plt.savefig('scenario2_basic_platinum.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Saved: scenario2_basic_platinum.png")
    plt.close()


def create_scenario3():
    """Scenario 3: PREMIUM (noisy) -> PREMIUM (victim)"""
    tenants = ['PremiumNoisy\n(noisy)', 'PremiumCorp\n(victim)']
    throttle_rates = [38.00, 0.0]
    throttled = [285, 0]
    successful = [465, 150]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('Scenario 3: PREMIUM (noisy) \u2192 PREMIUM (victim)\nIndividual Usage Plan per Tenant',
                 fontsize=16, fontweight='bold')

    ax1 = axes[0]
    colors = ['#e74c3c', '#27ae60']
    bars = ax1.bar(tenants, throttle_rates, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Throttle Rate (%)', fontweight='bold')
    ax1.set_title('Request Throttle Rate', fontweight='bold')
    ax1.set_ylim(0, 100)

    for bar, rate in zip(bars, throttle_rates):
        ax1.annotate(f'{rate:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    xytext=(0, 5), textcoords="offset points",
                    ha='center', va='bottom', fontweight='bold', fontsize=14)

    ax2 = axes[1]
    x = np.arange(len(tenants))
    width = 0.6

    ax2.bar(x, successful, width, label='Successful (200)',
            color='#27ae60', edgecolor='black')
    ax2.bar(x, throttled, width, bottom=successful,
            label='Throttled (429)', color='#e74c3c', edgecolor='black')

    ax2.set_ylabel('Number of Requests', fontweight='bold')
    ax2.set_title('Request Distribution', fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(tenants)
    ax2.legend(loc='upper right')

    for i, (s, t) in enumerate(zip(successful, throttled)):
        total = s + t
        ax2.annotate(f'{total}', xy=(i, total + 10), ha='center', fontweight='bold')

    plt.tight_layout()
    plt.savefig('scenario3_premium_premium.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Saved: scenario3_premium_premium.png")
    plt.close()


if __name__ == '__main__':
    print("Generating English charts...")

    results = load_results('crud-latency-results.json')
    create_crud_latency_by_tier(results)

    create_scenario1()
    create_scenario2()
    create_scenario3()

    print("Done.")
