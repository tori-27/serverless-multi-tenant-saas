"""
Grafikon 4: Súhrnné porovnanie všetkých scenárov
"""

import matplotlib.pyplot as plt
import numpy as np

# Nastavenie štýlu
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.titlesize'] = 13
plt.rcParams['axes.labelsize'] = 11

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('Test hlučného suseda: Izolácia nájomcov v multi-tenant SaaS', 
             fontsize=18, fontweight='bold', y=0.98)

# === Graf 1: Porovnanie miery obmedzovania hlučných nájomcov ===
ax1 = axes[0, 0]
scenarios = ['Scenár 1\nBASIC→STANDARD', 'Scenár 2\nBASIC→PLATINUM', 'Scenár 3\nPREMIUM→PREMIUM']
noisy_rates = [68.89, 64.17, 38.00]
colors_noisy = ['#e74c3c', '#e74c3c', '#f39c12']

bars1 = ax1.bar(scenarios, noisy_rates, color=colors_noisy, edgecolor='black', linewidth=1.5)
ax1.set_ylabel('Miera obmedzovania (%)', fontweight='bold')
ax1.set_title('Obmedzovanie hlučných nájomcov', fontweight='bold')
ax1.set_ylim(0, 100)
ax1.axhline(y=50, color='gray', linestyle='--', alpha=0.5, label='Cieľ: 50%')

for bar, rate in zip(bars1, noisy_rates):
    ax1.annotate(f'{rate:.1f}%',
                xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                xytext=(0, 5), textcoords="offset points",
                ha='center', va='bottom', fontweight='bold', fontsize=12)

# === Graf 2: Porovnanie miery obmedzovania obetí ===
ax2 = axes[0, 1]
victim_rates = [0.0, 0.0, 0.0]

bars2 = ax2.bar(scenarios, victim_rates, color='#27ae60', edgecolor='black', linewidth=1.5)
ax2.set_ylabel('Miera obmedzovania (%)', fontweight='bold')
ax2.set_title('Obmedzovanie obetí (cieľ: 0%)', fontweight='bold')
ax2.set_ylim(0, 10)

for bar, rate in zip(bars2, victim_rates):
    ax2.annotate(f'{rate:.1f}%',
                xy=(bar.get_x() + bar.get_width() / 2, 0.5),
                ha='center', va='bottom', fontweight='bold', fontsize=12, color='#27ae60')

# Pridanie textu "IZOLOVANÉ"
for i, bar in enumerate(bars2):
    ax2.text(bar.get_x() + bar.get_width() / 2, 5, 'IZOLOVANÉ', 
            ha='center', va='center', fontweight='bold', fontsize=11, color='#27ae60')

# === Graf 3: Celkový počet požiadaviek ===
ax3 = axes[1, 0]
x = np.arange(len(scenarios))
width = 0.35

noisy_requests = [360, 360, 750]
victim_requests = [145, 273, 150]

bars3a = ax3.bar(x - width/2, noisy_requests, width, label='Hlučný nájomca', 
                 color='#e74c3c', edgecolor='black', alpha=0.8)
bars3b = ax3.bar(x + width/2, victim_requests, width, label='Obeť', 
                 color='#27ae60', edgecolor='black', alpha=0.8)

ax3.set_ylabel('Počet požiadaviek', fontweight='bold')
ax3.set_title('Celkový počet požiadaviek', fontweight='bold')
ax3.set_xticks(x)
ax3.set_xticklabels(scenarios)
ax3.legend()

for bar in bars3a:
    ax3.annotate(f'{int(bar.get_height())}',
                xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                xytext=(0, 3), textcoords="offset points",
                ha='center', va='bottom', fontsize=10)
for bar in bars3b:
    ax3.annotate(f'{int(bar.get_height())}',
                xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                xytext=(0, 3), textcoords="offset points",
                ha='center', va='bottom', fontsize=10)

# === Graf 4: Stratégia obmedzenia podľa úrovne ===
ax4 = axes[1, 1]
ax4.axis('off')

# Tabuľka
table_data = [
    ['Úroveň', 'Stratégia', 'Limit', 'Izolácia'],
    ['BASIC', 'Zdieľaný (per-tier)', '10 req/s', 'Medzi úrovňami'],
    ['STANDARD', 'Zdieľaný (per-tier)', '15 req/s', 'Medzi úrovňami'],
    ['PREMIUM', 'Individuálny (per-tenant)', '20 req/s', 'Úplná'],
    ['PLATINUM', 'Vyhradený', '50 req/s', 'Úplná'],
]

table = ax4.table(cellText=table_data[1:], colLabels=table_data[0],
                  loc='center', cellLoc='center',
                  colColours=['#3498db', '#3498db', '#3498db', '#3498db'],
                  colWidths=[0.2, 0.35, 0.2, 0.25])
table.auto_set_font_size(False)
table.set_fontsize(11)
table.scale(1.2, 1.8)

# Farebné bunky hlavičky
for (row, col), cell in table.get_celld().items():
    if row == 0:
        cell.set_text_props(fontweight='bold', color='white')
        cell.set_facecolor('#2c3e50')
    elif col == 3:
        if 'Úplná' in cell.get_text().get_text():
            cell.set_facecolor('#d5f5e3')
        else:
            cell.set_facecolor('#fdebd0')

ax4.set_title('Stratégia obmedzenia rýchlosti podľa úrovne', fontweight='bold', pad=20)

# Záver
conclusion = """
Záver:
• Hlučný nájomca je obmedzený na 38-69% - obmedzenie rýchlosti funguje
• Všetky obete majú 0% obmedzenie - úplná izolácia
• PREMIUM/PLATINUM úrovne poskytujú garantovanú izoláciu
"""
fig.text(0.5, 0.02, conclusion, ha='center', fontsize=11, 
         bbox=dict(boxstyle='round', facecolor='#f8f9fa', edgecolor='#dee2e6'),
         family='sans-serif')

plt.tight_layout(rect=[0, 0.08, 1, 0.96])
plt.savefig('summary_all_scenarios.png', dpi=150, bbox_inches='tight', 
            facecolor='white', edgecolor='none')
print("Uložené: summary_all_scenarios.png")
plt.close()
