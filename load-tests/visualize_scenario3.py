"""
Grafikon 3: Porovnanie miery obmedzovania pre scenár PREMIUM → PREMIUM
"""

import matplotlib.pyplot as plt
import numpy as np

# Nastavenie štýlu
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 12
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.labelsize'] = 12

# Dáta z testu
tenants = ['PremiumNoisy\n(hlučný)', 'PremiumCorp\n(obeť)']
throttle_rates = [38.00, 0.0]
requests = [750, 150]
throttled = [285, 0]
successful = [465, 150]

fig, axes = plt.subplots(1, 2, figsize=(12, 5))
fig.suptitle('Scenár 3: PREMIUM (hlučný) → PREMIUM (obeť)\nIndividuálny Usage Plan pre každého nájomcu', 
             fontsize=16, fontweight='bold')

# Graf 1: Miera obmedzovania
ax1 = axes[0]
colors = ['#e74c3c', '#27ae60']
bars = ax1.bar(tenants, throttle_rates, color=colors, edgecolor='black', linewidth=1.5)
ax1.set_ylabel('Miera obmedzovania (%)', fontweight='bold')
ax1.set_title('Miera obmedzovania požiadaviek', fontweight='bold')
ax1.set_ylim(0, 100)

for bar, rate in zip(bars, throttle_rates):
    ax1.annotate(f'{rate:.1f}%',
                xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                xytext=(0, 5), textcoords="offset points",
                ha='center', va='bottom', fontweight='bold', fontsize=14)

# Graf 2: Rozdelenie požiadaviek
ax2 = axes[1]
x = np.arange(len(tenants))
width = 0.6

bars_success = ax2.bar(x, successful, width, label='Úspešné (200)', 
                       color='#27ae60', edgecolor='black')
bars_throttle = ax2.bar(x, throttled, width, bottom=successful, 
                        label='Obmedzené (429)', color='#e74c3c', edgecolor='black')

ax2.set_ylabel('Počet požiadaviek', fontweight='bold')
ax2.set_title('Rozdelenie požiadaviek', fontweight='bold')
ax2.set_xticks(x)
ax2.set_xticklabels(tenants)
ax2.legend(loc='upper right')

# Anotácie
for i, (s, t) in enumerate(zip(successful, throttled)):
    total = s + t
    ax2.annotate(f'{total}', xy=(i, total + 10), ha='center', fontweight='bold')

plt.tight_layout()
plt.savefig('scenario3_premium_premium.png', dpi=150, bbox_inches='tight', 
            facecolor='white', edgecolor='none')
print("Uložené: scenario3_premium_premium.png")
plt.close()
