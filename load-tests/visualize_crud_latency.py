"""
Vizualizácia výsledkov CRUD latency testu
Porovnanie latencie operácií naprieč úrovňami služby (BASIC, STANDARD, PREMIUM, PLATINUM)
"""

import json
import matplotlib.pyplot as plt
import numpy as np
import sys

# Nastavenie štýlu
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.titlesize'] = 13
plt.rcParams['axes.labelsize'] = 11
plt.rcParams['figure.figsize'] = (14, 10)

# Farby pre jednotlivé úrovne
TIER_COLORS = {
    'BASIC': '#3498db',
    'STANDARD': '#2ecc71',
    'PREMIUM': '#f39c12',
    'PLATINUM': '#9b59b6'
}

OPERATION_NAMES = {
    'GET_LIST': 'GET /products',
    'GET_SINGLE': 'GET /{id}',
    'POST': 'POST',
    'PUT': 'PUT',
    'DELETE': 'DELETE'
}

TIERS = ['BASIC', 'STANDARD', 'PREMIUM', 'PLATINUM']
ALL_OPS = ['GET_LIST', 'GET_SINGLE', 'POST', 'PUT', 'DELETE']


def safe_val(results, tier, op, key, default=0):
    """Bezpečne načíta hodnotu z výsledkov, vráti default ak chýba alebo je 0"""
    try:
        v = results[tier][op][key]
        return v if v and v > 0 else default
    except (KeyError, TypeError):
        return default


def get_available_ops(results):
    """Zistí, ktoré operácie majú reálne dáta (nenulové p95 aspoň u jedného tieru)"""
    available = []
    for op in ALL_OPS:
        has_data = any(safe_val(results, tier, op, 'p95') > 0 for tier in TIERS)
        if has_data:
            available.append(op)
    return available if available else ALL_OPS


def load_results(filename='crud-latency-results.json'):
    """Načíta výsledky z JSON súboru"""
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
            print(f"Načítané výsledky zo súboru {filename}")
            return data
    except FileNotFoundError:
        print(f"Súbor {filename} nebol nájdený. Používam vzorové dáta.")
        return {
            "BASIC": {
                "GET_LIST": {"p50": 680, "p95": 1250, "p99": 1800, "avg": 780, "min": 450, "max": 2500},
                "GET_SINGLE": {"p50": 520, "p95": 950, "p99": 1400, "avg": 620, "min": 380, "max": 1800},
                "POST": {"p50": 620, "p95": 1100, "p99": 1600, "avg": 710, "min": 420, "max": 2200},
                "PUT": {"p50": 580, "p95": 1050, "p99": 1500, "avg": 670, "min": 400, "max": 2000},
                "DELETE": {"p50": 540, "p95": 980, "p99": 1350, "avg": 630, "min": 370, "max": 1700},
                "totalRequests": 300,
                "errorRate": 1.5
            },
            "STANDARD": {
                "GET_LIST": {"p50": 660, "p95": 1200, "p99": 1750, "avg": 750, "min": 430, "max": 2400},
                "GET_SINGLE": {"p50": 500, "p95": 920, "p99": 1350, "avg": 600, "min": 360, "max": 1750},
                "POST": {"p50": 600, "p95": 1080, "p99": 1550, "avg": 690, "min": 400, "max": 2100},
                "PUT": {"p50": 560, "p95": 1020, "p99": 1450, "avg": 650, "min": 380, "max": 1950},
                "DELETE": {"p50": 520, "p95": 950, "p99": 1300, "avg": 610, "min": 350, "max": 1650},
                "totalRequests": 300,
                "errorRate": 1.2
            },
            "PREMIUM": {
                "GET_LIST": {"p50": 650, "p95": 1180, "p99": 1700, "avg": 740, "min": 420, "max": 2350},
                "GET_SINGLE": {"p50": 490, "p95": 900, "p99": 1320, "avg": 580, "min": 350, "max": 1700},
                "POST": {"p50": 590, "p95": 1060, "p99": 1520, "avg": 680, "min": 390, "max": 2050},
                "PUT": {"p50": 550, "p95": 1000, "p99": 1420, "avg": 640, "min": 370, "max": 1900},
                "DELETE": {"p50": 510, "p95": 930, "p99": 1280, "avg": 600, "min": 340, "max": 1600},
                "totalRequests": 300,
                "errorRate": 0.8
            },
            "PLATINUM": {
                "GET_LIST": {"p50": 620, "p95": 1100, "p99": 1600, "avg": 700, "min": 400, "max": 2200},
                "GET_SINGLE": {"p50": 470, "p95": 850, "p99": 1250, "avg": 550, "min": 330, "max": 1600},
                "POST": {"p50": 560, "p95": 1000, "p99": 1440, "avg": 650, "min": 370, "max": 1950},
                "PUT": {"p50": 530, "p95": 960, "p99": 1380, "avg": 620, "min": 350, "max": 1850},
                "DELETE": {"p50": 490, "p95": 890, "p99": 1220, "avg": 580, "min": 320, "max": 1550},
                "totalRequests": 300,
                "errorRate": 0.5
            }
        }


def create_latency_comparison_chart(results):
    """Vytvorí porovnávací graf latencie pre všetky operácie a úrovne"""
    
    ops = get_available_ops(results)
    n_ops = len(ops)
    
    if n_ops <= 3:
        rows, cols = 1, n_ops
    else:
        rows, cols = 2, 3
    
    fig, axes = plt.subplots(rows, cols, figsize=(5.5 * cols, 5 * rows))
    fig.suptitle('Porovnanie latencie CRUD operácií podľa úrovne služby\n(Pooled vs Siloed infraštruktúra)', 
                 fontsize=16, fontweight='bold')
    
    if n_ops == 1:
        axes = np.array([axes])
    axes_flat = axes.flatten() if hasattr(axes, 'flatten') else [axes]
    
    for idx, op in enumerate(ops):
        ax = axes_flat[idx]
        
        x = np.arange(len(TIERS))
        width = 0.25
        
        p50_values = [safe_val(results, tier, op, 'p50') for tier in TIERS]
        p95_values = [safe_val(results, tier, op, 'p95') for tier in TIERS]
        p99_values = [safe_val(results, tier, op, 'p99') for tier in TIERS]
        
        bars1 = ax.bar(x - width, p50_values, width, label='p50', 
                       color='#A8C4E0', edgecolor='#333333', linewidth=0.5)
        bars2 = ax.bar(x, p95_values, width, label='p95', 
                       color='#5B9BD5', edgecolor='#333333', linewidth=0.5)
        bars3 = ax.bar(x + width, p99_values, width, label='p99', 
                       color='#2C5F8A', edgecolor='#333333', linewidth=0.5)
        
        ax.set_ylabel('Latencia (ms)')
        ax.set_title(f'{OPERATION_NAMES[op]}', fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(TIERS, fontsize=9)
        ax.legend(loc='upper right', fontsize=8)
        
        all_vals = p50_values + p95_values + p99_values
        max_val = max(v for v in all_vals if v > 0) if any(v > 0 for v in all_vals) else 100
        ax.set_ylim(0, max_val * 1.25)
        
        for bars in [bars1, bars2, bars3]:
            for bar in bars:
                height = bar.get_height()
                if height > 0:
                    ax.annotate(f'{height:.0f}',
                               xy=(bar.get_x() + bar.get_width() / 2, height),
                               xytext=(0, 2), textcoords="offset points",
                               ha='center', va='bottom', fontsize=7)
    
    # Skryť nepoužité subploty a pridať info panel
    for idx in range(n_ops, rows * cols):
        ax_extra = axes_flat[idx]
        ax_extra.axis('off')
        if idx == n_ops:
            info_text = """
    Infraštruktúrny model:
    
    BASIC, STANDARD, PREMIUM
    → Pooled (zdieľané Lambda + DynamoDB)
    
    PLATINUM  
    → Siloed (dedikované Lambda + DynamoDB)
    
    Percentily:
    • p50 = medián (typická odozva)
    • p95 = horná hranica pre 95% požiadaviek
    • p99 = tail latency (najpomalšie prípady)
    """
            ax_extra.text(0.1, 0.5, info_text, transform=ax_extra.transAxes, 
                         fontsize=10, verticalalignment='center',
                         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    plt.savefig('crud_latency_comparison.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Uložené: crud_latency_comparison.png")
    plt.close()


def create_tier_summary_chart(results):
    """Vytvorí súhrnný graf pre každú úroveň služby"""
    
    ops = get_available_ops(results)
    op_labels = [OPERATION_NAMES[op] for op in ops]
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Latencia CRUD operácií pre jednotlivé úrovne služby\n(p50, p95, p99 v milisekundách)', 
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
        
        infra_type = "Siloed (dedikované)" if tier == "PLATINUM" else "Pooled (zdieľané)"
        total_req = results.get(tier, {}).get('totalRequests', 0)
        error_rate = results.get(tier, {}).get('errorRate', 0)
        
        ax.set_ylabel('Latencia (ms)')
        ax.set_title(f'{tier} - {infra_type}\nPožiadavky: {total_req}, Chyby: {error_rate:.2f}%', 
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
    print("Uložené: crud_latency_by_tier.png")
    plt.close()


def create_pooled_vs_siloed_chart(results):
    """Vytvorí porovnávací graf pooled vs siloed infraštruktúry"""
    
    ops = get_available_ops(results)
    op_labels = [OPERATION_NAMES[op] for op in ops]
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle('Porovnanie Pooled vs Siloed infraštruktúry\n(priemer p95 latencie)', 
                 fontsize=16, fontweight='bold')
    
    pooled_tiers = ['BASIC', 'STANDARD', 'PREMIUM']
    
    pooled_avg_p95 = []
    for op in ops:
        vals = [safe_val(results, t, op, 'p95') for t in pooled_tiers]
        nonzero = [v for v in vals if v > 0]
        pooled_avg_p95.append(sum(nonzero) / len(nonzero) if nonzero else 0)
    
    siloed_p95 = [safe_val(results, 'PLATINUM', op, 'p95') for op in ops]
    
    ax1 = axes[0]
    x = np.arange(len(ops))
    width = 0.35
    
    bars1 = ax1.bar(x - width/2, pooled_avg_p95, width, label='Pooled (priemer)', 
                    color='#5B9BD5', edgecolor='#333333', linewidth=0.5)
    bars2 = ax1.bar(x + width/2, siloed_p95, width, label='Siloed (PLATINUM)', 
                    color='#2C5F8A', edgecolor='#333333', linewidth=0.5)
    
    ax1.set_ylabel('Latencia p95 (ms)')
    ax1.set_title('Latencia p95 podľa operácie', fontweight='bold')
    ax1.set_xticks(x)
    ax1.set_xticklabels(op_labels, fontsize=9, rotation=15, ha='right')
    ax1.legend(loc='upper right')
    
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            if height > 0:
                ax1.annotate(f'{height:.0f}',
                            xy=(bar.get_x() + bar.get_width() / 2, height),
                            xytext=(0, 3), textcoords="offset points",
                            ha='center', va='bottom', fontsize=9)
    
    ax2 = axes[1]
    diff_percent = [(p - s) / p * 100 if p > 0 else 0 for p, s in zip(pooled_avg_p95, siloed_p95)]
    
    colors = ['#5B9BD5' if d > 0 else '#D6A07C' for d in diff_percent]
    bars = ax2.bar(x, diff_percent, color=colors, edgecolor='black', linewidth=0.5)
    
    ax2.set_ylabel('Rozdiel (%)')
    ax2.set_title('Zlepšenie latencie v Siloed modeli\n(kladné = Siloed rýchlejší)', fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(op_labels, fontsize=9, rotation=15, ha='right')
    ax2.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
    
    for bar, d in zip(bars, diff_percent):
        height = bar.get_height()
        ax2.annotate(f'{d:.1f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3 if height >= 0 else -12), textcoords="offset points",
                    ha='center', va='bottom', fontsize=10, fontweight='bold')
    
    plt.tight_layout()
    plt.savefig('crud_pooled_vs_siloed.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Uložené: crud_pooled_vs_siloed.png")
    plt.close()


def create_p99_heatmap(results):
    """Vytvorí heatmapu p99 latencie"""
    
    ops = get_available_ops(results)
    
    fig, ax = plt.subplots(figsize=(max(8, 2 * len(ops)), 6))
    
    data = np.array([[safe_val(results, tier, op, 'p99') for op in ops] for tier in TIERS])
    
    # Ak všetky hodnoty sú 0, použiť p95
    if data.max() == 0:
        data = np.array([[safe_val(results, tier, op, 'p95') for op in ops] for tier in TIERS])
        metric_label = 'p95'
    else:
        metric_label = 'p99'
    
    im = ax.imshow(data, cmap='YlOrBr', aspect='auto')
    
    ax.set_xticks(np.arange(len(ops)))
    ax.set_yticks(np.arange(len(TIERS)))
    ax.set_xticklabels([OPERATION_NAMES[op] for op in ops], fontsize=10)
    ax.set_yticklabels(TIERS, fontsize=10)
    
    for i in range(len(TIERS)):
        for j in range(len(ops)):
            val = data[i, j]
            ax.text(j, i, f'{val:.0f}' if val > 0 else 'N/A',
                   ha="center", va="center", color="black", fontweight='bold', fontsize=11)
    
    ax.set_title(f'Heatmapa {metric_label} latencie (ms)\nTmavšia = vyššia latencia, Svetlejšia = nižšia latencia', 
                 fontweight='bold', fontsize=14)
    
    cbar = ax.figure.colorbar(im, ax=ax)
    cbar.ax.set_ylabel('Latencia (ms)', rotation=-90, va="bottom")
    
    plt.tight_layout()
    plt.savefig('crud_latency_heatmap.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Uložené: crud_latency_heatmap.png")
    plt.close()


def create_read_vs_write_chart(results):
    """Vytvorí porovnanie Read vs Write operácií pre každý tier"""
    
    read_ops = ['GET_LIST', 'GET_SINGLE']
    write_ops = ['POST', 'PUT', 'DELETE']
    
    # Skontroluj, či máme write dáta
    has_write = any(safe_val(results, t, op, 'p50') > 0 for t in TIERS for op in write_ops)
    has_read_single = any(safe_val(results, t, 'GET_SINGLE', 'p50') > 0 for t in TIERS)
    
    if not has_write and not has_read_single:
        print("Preskočené: crud_read_vs_write.png (nedostatok dát pre read/write porovnanie)")
        return
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle('Porovnanie latencie Read vs Write operácií\n(priemerná p50 latencia podľa úrovne služby)', 
                 fontsize=16, fontweight='bold')
    
    # Graf 1: Priemerné p50 pre Read vs Write per tier
    ax1 = axes[0]
    x = np.arange(len(TIERS))
    width = 0.35
    
    read_avg = []
    write_avg = []
    for tier in TIERS:
        r_vals = [safe_val(results, tier, op, 'p50') for op in read_ops]
        r_nonzero = [v for v in r_vals if v > 0]
        read_avg.append(sum(r_nonzero) / len(r_nonzero) if r_nonzero else 0)
        
        w_vals = [safe_val(results, tier, op, 'p50') for op in write_ops]
        w_nonzero = [v for v in w_vals if v > 0]
        write_avg.append(sum(w_nonzero) / len(w_nonzero) if w_nonzero else 0)
    
    bars1 = ax1.bar(x - width/2, read_avg, width, label='Read (GET)', 
                    color='#5B9BD5', edgecolor='#333333', linewidth=0.5)
    bars2 = ax1.bar(x + width/2, write_avg, width, label='Write (POST/PUT/DELETE)', 
                    color='#8B7EB8', edgecolor='#333333', linewidth=0.5)
    
    ax1.set_ylabel('Priemerná latencia p50 (ms)')
    ax1.set_title('Read vs Write: medián latencie', fontweight='bold')
    ax1.set_xticks(x)
    ax1.set_xticklabels(TIERS)
    ax1.legend(loc='upper right')
    
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            if height > 0:
                ax1.annotate(f'{height:.0f}',
                            xy=(bar.get_x() + bar.get_width() / 2, height),
                            xytext=(0, 3), textcoords="offset points",
                            ha='center', va='bottom', fontsize=9)
    
    # Graf 2: p95 pre Read vs Write
    ax2 = axes[1]
    
    read_p95 = []
    write_p95 = []
    for tier in TIERS:
        r_vals = [safe_val(results, tier, op, 'p95') for op in read_ops]
        r_nonzero = [v for v in r_vals if v > 0]
        read_p95.append(sum(r_nonzero) / len(r_nonzero) if r_nonzero else 0)
        
        w_vals = [safe_val(results, tier, op, 'p95') for op in write_ops]
        w_nonzero = [v for v in w_vals if v > 0]
        write_p95.append(sum(w_nonzero) / len(w_nonzero) if w_nonzero else 0)
    
    bars1 = ax2.bar(x - width/2, read_p95, width, label='Read (GET)', 
                    color='#5B9BD5', edgecolor='#333333', linewidth=0.5)
    bars2 = ax2.bar(x + width/2, write_p95, width, label='Write (POST/PUT/DELETE)', 
                    color='#8B7EB8', edgecolor='#333333', linewidth=0.5)
    
    ax2.set_ylabel('Priemerná latencia p95 (ms)')
    ax2.set_title('Read vs Write: p95 latencia', fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels(TIERS)
    ax2.legend(loc='upper right')
    
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            if height > 0:
                ax2.annotate(f'{height:.0f}',
                            xy=(bar.get_x() + bar.get_width() / 2, height),
                            xytext=(0, 3), textcoords="offset points",
                            ha='center', va='bottom', fontsize=9)
    
    plt.tight_layout()
    plt.savefig('crud_read_vs_write.png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print("Uložené: crud_read_vs_write.png")
    plt.close()


def main():
    print("=" * 60)
    print("Vizualizácia výsledkov CRUD latency testu")
    print("=" * 60)
    
    results = load_results()
    
    # Diagnostika dát
    ops = get_available_ops(results)
    print(f"\nOperácie s dátami: {', '.join(OPERATION_NAMES[op] for op in ops)}")
    missing = [op for op in ALL_OPS if op not in ops]
    if missing:
        print(f"Chýbajúce operácie (bez dát): {', '.join(OPERATION_NAMES[op] for op in missing)}")
    
    print("\nGenerovanie grafov...")
    create_latency_comparison_chart(results)
    create_tier_summary_chart(results)
    create_pooled_vs_siloed_chart(results)
    create_p99_heatmap(results)
    create_read_vs_write_chart(results)
    
    print("\n" + "=" * 60)
    print("Všetky grafy boli vygenerované!")
    print("=" * 60)
    
    # Výpis súhrnu
    print("\nSúhrn výsledkov:")
    print("-" * 90)
    print(f"{'Tier':10} | {'Priem. p50':>12} | {'Priem. p95':>12} | {'Priem. p99':>12} | {'Požiadavky':>10} | {'Chyby':>8}")
    print("-" * 90)
    for tier in TIERS:
        vals_p50 = [safe_val(results, tier, op, 'p50') for op in ops]
        vals_p95 = [safe_val(results, tier, op, 'p95') for op in ops]
        vals_p99 = [safe_val(results, tier, op, 'p99') for op in ops]
        
        nz_p50 = [v for v in vals_p50 if v > 0]
        nz_p95 = [v for v in vals_p95 if v > 0]
        nz_p99 = [v for v in vals_p99 if v > 0]
        
        avg_p50 = sum(nz_p50) / len(nz_p50) if nz_p50 else 0
        avg_p95 = sum(nz_p95) / len(nz_p95) if nz_p95 else 0
        avg_p99 = sum(nz_p99) / len(nz_p99) if nz_p99 else 0
        total_req = results.get(tier, {}).get('totalRequests', 0)
        error_rate = results.get(tier, {}).get('errorRate', 0)
        
        print(f"{tier:10} | {avg_p50:9.0f} ms | {avg_p95:9.0f} ms | {avg_p99:9.0f} ms | {total_req:>10} | {error_rate:>6.2f}%")
    print("-" * 90)


if __name__ == "__main__":
    main()
