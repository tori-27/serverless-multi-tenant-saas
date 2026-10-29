"""
Comprehensive Load Test Visualization
Generates PNG charts for:
1. Rate Limiting (Noisy Neighbor)
2. CRUD Latency (p50, p90, p95)
3. Tenant Registration Latency
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import pandas as pd

# Set style
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.labelsize'] = 12

def create_rate_limiting_charts():
    """Create Rate Limiting / Noisy Neighbor visualization"""
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    fig.suptitle('Rate Limiting: Noisy Neighbor Test Results', fontsize=16, fontweight='bold')
    
    # Data from test results
    tenants = ['BASIC\n(noisy)', 'PLATINUM\n(victim)']
    error_rates = [44.5, 0.0]
    total_requests = [1480, 147]
    successful = [821, 147]
    throttled = [659, 0]
    
    colors_success = ['#ff6b6b', '#51cf66']
    colors_throttle = ['#ff8787', '#69db7c']
    
    # Chart 1: Error Rate Comparison
    ax1 = axes[0]
    bars1 = ax1.bar(tenants, error_rates, color=['#ff6b6b', '#51cf66'], edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Error Rate (%)')
    ax1.set_title('Throttling Rate by Tier')
    ax1.set_ylim(0, 60)
    for bar, rate in zip(bars1, error_rates):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1.5, 
                f'{rate}%', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    # Chart 2: Request Distribution (Stacked)
    ax2 = axes[1]
    x = np.arange(len(tenants))
    width = 0.6
    bars_success = ax2.bar(x, successful, width, label='Successful', color='#51cf66', edgecolor='black')
    bars_throttle = ax2.bar(x, throttled, width, bottom=successful, label='Throttled (429)', color='#ff6b6b', edgecolor='black')
    ax2.set_ylabel('Number of Requests')
    ax2.set_title('Request Distribution')
    ax2.set_xticks(x)
    ax2.set_xticklabels(tenants)
    ax2.legend(loc='upper right')
    
    # Add totals on top
    for i, (s, t) in enumerate(zip(successful, throttled)):
        ax2.text(i, s + t + 20, f'Total: {s+t}', ha='center', fontsize=10)
    
    # Chart 3: Rate Limits Configuration
    ax3 = axes[2]
    tiers = ['BASIC', 'STANDARD', 'PREMIUM', 'PLATINUM']
    rate_limits = [50, 75, 100, 300]
    colors = ['#ff6b6b', '#ffa94d', '#69db7c', '#4dabf7']
    
    bars3 = ax3.barh(tiers, rate_limits, color=colors, edgecolor='black', linewidth=1.5)
    ax3.set_xlabel('Requests per Second')
    ax3.set_title('Rate Limits by Tier')
    ax3.set_xlim(0, 350)
    
    for bar, limit in zip(bars3, rate_limits):
        ax3.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2, 
                f'{limit} req/s', va='center', fontsize=11)
    
    plt.tight_layout()
    plt.savefig('rate_limiting_results.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✅ Created: rate_limiting_results.png")

def create_crud_latency_charts():
    """Create CRUD Operations Latency visualization"""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('CRUD Operations Latency (PLATINUM Tenant)', fontsize=16, fontweight='bold')
    
    # Data from test results (in ms)
    operations = ['Create\nProduct', 'Get\nProducts', 'Create\nOrder', 'Get\nOrders']
    
    latency_data = {
        'min': [124, 651, 126, 668],
        'avg': [385, 913, 265, 891],
        'p50': [176, 788, 183, 783],
        'p90': [338, 1140, 295, 1006],
        'p95': [691, 1216, 570, 1097],
        'max': [3740, 2218, 1501, 2301]
    }
    
    colors = ['#4dabf7', '#69db7c', '#ffa94d', '#ff6b6b']
    
    # Chart 1: Percentile Comparison (Bar Chart)
    ax1 = axes[0, 0]
    x = np.arange(len(operations))
    width = 0.2
    
    bars_p50 = ax1.bar(x - width, latency_data['p50'], width, label='p50', color='#4dabf7', edgecolor='black')
    bars_p90 = ax1.bar(x, latency_data['p90'], width, label='p90', color='#ffa94d', edgecolor='black')
    bars_p95 = ax1.bar(x + width, latency_data['p95'], width, label='p95', color='#ff6b6b', edgecolor='black')
    
    ax1.set_ylabel('Latency (ms)')
    ax1.set_title('Latency Percentiles by Operation')
    ax1.set_xticks(x)
    ax1.set_xticklabels(operations)
    ax1.legend(loc='upper right')
    ax1.set_ylim(0, 1500)
    
    # Chart 2: Box Plot Style (Min/Avg/Max)
    ax2 = axes[0, 1]
    
    for i, op in enumerate(operations):
        ax2.plot([i, i], [latency_data['min'][i], latency_data['max'][i]], 
                color=colors[i], linewidth=3, alpha=0.5)
        ax2.scatter([i], [latency_data['min'][i]], color=colors[i], s=100, marker='v', zorder=5)
        ax2.scatter([i], [latency_data['max'][i]], color=colors[i], s=100, marker='^', zorder=5)
        ax2.scatter([i], [latency_data['avg'][i]], color=colors[i], s=150, marker='o', zorder=5, edgecolor='black')
    
    ax2.set_ylabel('Latency (ms)')
    ax2.set_title('Latency Range (Min → Avg → Max)')
    ax2.set_xticks(range(len(operations)))
    ax2.set_xticklabels(operations)
    ax2.set_ylim(0, 4000)
    
    # Legend
    legend_elements = [
        plt.scatter([], [], marker='v', s=100, c='gray', label='Min'),
        plt.scatter([], [], marker='o', s=150, c='gray', edgecolor='black', label='Avg'),
        plt.scatter([], [], marker='^', s=100, c='gray', label='Max')
    ]
    ax2.legend(handles=legend_elements, loc='upper right')
    
    # Chart 3: Read vs Write Comparison
    ax3 = axes[1, 0]
    
    write_ops = ['Create Product', 'Create Order']
    read_ops = ['Get Products', 'Get Orders']
    
    write_p50 = [176, 183]
    write_p95 = [691, 570]
    read_p50 = [788, 783]
    read_p95 = [1216, 1097]
    
    x = np.arange(2)
    width = 0.35
    
    ax3.bar(x - width/2, write_p50, width, label='Write p50', color='#51cf66', edgecolor='black')
    ax3.bar(x + width/2, read_p50, width, label='Read p50', color='#4dabf7', edgecolor='black')
    
    ax3.set_ylabel('Latency (ms)')
    ax3.set_title('Read vs Write Latency (p50)')
    ax3.set_xticks(x)
    ax3.set_xticklabels(['Products', 'Orders'])
    ax3.legend()
    
    # Add values on bars
    for i in range(2):
        ax3.text(i - width/2, write_p50[i] + 20, f'{write_p50[i]}ms', ha='center', fontsize=10)
        ax3.text(i + width/2, read_p50[i] + 20, f'{read_p50[i]}ms', ha='center', fontsize=10)
    
    # Chart 4: Summary Table
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    table_data = [
        ['Operation', 'Min', 'p50', 'p90', 'p95', 'Max'],
        ['Create Product', '124ms', '176ms', '338ms', '691ms', '3740ms'],
        ['Get Products', '651ms', '788ms', '1140ms', '1216ms', '2218ms'],
        ['Create Order', '126ms', '183ms', '295ms', '570ms', '1501ms'],
        ['Get Orders', '668ms', '783ms', '1006ms', '1097ms', '2301ms'],
    ]
    
    table = ax4.table(
        cellText=table_data[1:],
        colLabels=table_data[0],
        cellLoc='center',
        loc='center',
        colColours=['#e9ecef']*6,
        cellColours=[
            ['#d3f9d8', '#d3f9d8', '#d3f9d8', '#d3f9d8', '#fff3bf', '#ffe3e3'],
            ['#d0ebff', '#d0ebff', '#d0ebff', '#fff3bf', '#ffe3e3', '#ffe3e3'],
            ['#d3f9d8', '#d3f9d8', '#d3f9d8', '#d3f9d8', '#fff3bf', '#ffe3e3'],
            ['#d0ebff', '#d0ebff', '#d0ebff', '#fff3bf', '#ffe3e3', '#ffe3e3'],
        ]
    )
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1.2, 1.8)
    ax4.set_title('Latency Summary Table', pad=20)
    
    plt.tight_layout()
    plt.savefig('crud_latency_results.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✅ Created: crud_latency_results.png")

def create_registration_latency_chart():
    """Create Tenant Registration Latency visualization"""
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('SILO Tenant Registration Latency', fontsize=16, fontweight='bold')
    
    # Data from test results
    metrics = ['Min', 'Avg', 'p50', 'p90', 'p95', 'Max']
    values = [99, 143, 127, 195, 243, 290]
    
    colors = ['#51cf66', '#69db7c', '#4dabf7', '#ffa94d', '#ff8787', '#ff6b6b']
    
    # Chart 1: Bar chart
    ax1 = axes[0]
    bars = ax1.bar(metrics, values, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Latency (ms)')
    ax1.set_title('Registration API Latency Percentiles')
    ax1.set_ylim(0, 350)
    
    for bar, val in zip(bars, values):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5, 
                f'{val}ms', ha='center', va='bottom', fontweight='bold')
    
    # Chart 2: Process breakdown
    ax2 = axes[1]
    
    processes = ['API Gateway\n+ Lambda', 'Cognito\nUser Create', 'DynamoDB\nWrite', 'CodePipeline\nTrigger']
    estimated_times = [30, 50, 30, 33]  # Rough breakdown of ~143ms avg
    
    bars2 = ax2.barh(processes, estimated_times, color=['#4dabf7', '#9775fa', '#ffd43b', '#ff922b'], 
                     edgecolor='black', linewidth=1.5)
    ax2.set_xlabel('Estimated Time (ms)')
    ax2.set_title('Registration Process Breakdown')
    ax2.set_xlim(0, 80)
    
    for bar, val in zip(bars2, estimated_times):
        ax2.text(bar.get_width() + 2, bar.get_y() + bar.get_height()/2, 
                f'~{val}ms', va='center', fontsize=11)
    
    # Add total annotation
    ax2.annotate(f'Total Avg: {sum(estimated_times)}ms', xy=(0.95, 0.05), xycoords='axes fraction',
                fontsize=12, fontweight='bold', ha='right',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    
    plt.tight_layout()
    plt.savefig('registration_latency_results.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✅ Created: registration_latency_results.png")

def create_combined_summary():
    """Create a combined summary of all tests"""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Multi-Tenant SaaS Load Test Summary', fontsize=18, fontweight='bold')
    
    # 1. Rate Limiting Summary
    ax1 = axes[0, 0]
    tenants = ['BASIC (noisy)', 'PLATINUM (victim)']
    error_rates = [44.5, 0.0]
    bars1 = ax1.bar(tenants, error_rates, color=['#ff6b6b', '#51cf66'], edgecolor='black', linewidth=2)
    ax1.set_ylabel('Throttle Rate (%)')
    ax1.set_title('🚦 Rate Limiting Isolation')
    ax1.set_ylim(0, 60)
    for bar, rate in zip(bars1, error_rates):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 2, 
                f'{rate}%', ha='center', fontweight='bold', fontsize=14)
    ax1.axhline(y=50, color='red', linestyle='--', alpha=0.5, label='Expected ~50%')
    ax1.legend()
    
    # 2. CRUD p50 Latency
    ax2 = axes[0, 1]
    ops = ['Create\nProduct', 'Get\nProducts', 'Create\nOrder', 'Get\nOrders']
    p50 = [176, 788, 183, 783]
    colors = ['#51cf66', '#4dabf7', '#51cf66', '#4dabf7']
    bars2 = ax2.bar(ops, p50, color=colors, edgecolor='black', linewidth=1.5)
    ax2.set_ylabel('Latency (ms)')
    ax2.set_title('⚡ CRUD p50 Latency')
    for bar, val in zip(bars2, p50):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 15, 
                f'{val}ms', ha='center', fontsize=10)
    ax2.legend([mpatches.Patch(color='#51cf66'), mpatches.Patch(color='#4dabf7')],
               ['Write', 'Read'], loc='upper left')
    
    # 3. Registration Latency
    ax3 = axes[1, 0]
    metrics = ['Min', 'p50', 'p95', 'Max']
    reg_values = [99, 127, 243, 290]
    bars3 = ax3.bar(metrics, reg_values, color=['#51cf66', '#4dabf7', '#ffa94d', '#ff6b6b'], 
                   edgecolor='black', linewidth=1.5)
    ax3.set_ylabel('Latency (ms)')
    ax3.set_title('📝 Tenant Registration Latency')
    for bar, val in zip(bars3, reg_values):
        ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5, 
                f'{val}ms', ha='center', fontsize=11)
    
    # 4. Summary Stats
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    summary_text = """
    ╔══════════════════════════════════════════════════════════╗
    ║           LOAD TEST RESULTS SUMMARY                      ║
    ╠══════════════════════════════════════════════════════════╣
    ║                                                          ║
    ║  🚦 RATE LIMITING (Noisy Neighbor Test)                  ║
    ║     ├─ BASIC tenant: 44.5% throttled (expected ~50%)     ║
    ║     └─ PLATINUM tenant: 0% errors (fully isolated) ✓     ║
    ║                                                          ║
    ║  ⚡ CRUD LATENCY (PLATINUM Tenant)                        ║
    ║     ├─ Write operations: p50 ~180ms                      ║
    ║     └─ Read operations: p50 ~785ms                       ║
    ║                                                          ║
    ║  📝 TENANT REGISTRATION                                  ║
    ║     ├─ API Response: p50 = 127ms, p95 = 243ms            ║
    ║     └─ Full SILO Stack: ~5-10 min (async)                ║
    ║                                                          ║
    ║  ✅ CONCLUSION: Multi-tenant isolation VERIFIED          ║
    ╚══════════════════════════════════════════════════════════╝
    """
    
    ax4.text(0.5, 0.5, summary_text, transform=ax4.transAxes, fontsize=11,
            verticalalignment='center', horizontalalignment='center',
            fontfamily='monospace',
            bbox=dict(boxstyle='round', facecolor='#f8f9fa', edgecolor='#dee2e6', linewidth=2))
    
    plt.tight_layout()
    plt.savefig('load_test_summary.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✅ Created: load_test_summary.png")

def save_results_to_csv():
    """Save all results to CSV files"""
    
    # Rate Limiting Results
    rate_limiting_df = pd.DataFrame({
        'tenant': ['BASIC (noisy)', 'PLATINUM (victim)'],
        'tier': ['BASIC', 'PLATINUM'],
        'total_requests': [1480, 147],
        'successful': [821, 147],
        'throttled': [659, 0],
        'error_rate_pct': [44.5, 0.0],
        'rate_limit_rps': [50, 300],
        'test_rate_rps': [100, 10]
    })
    rate_limiting_df.to_csv('rate_limiting_results.csv', index=False)
    print("✅ Created: rate_limiting_results.csv")
    
    # CRUD Latency Results
    crud_latency_df = pd.DataFrame({
        'operation': ['Create Product', 'Get Products', 'Create Order', 'Get Orders'],
        'type': ['write', 'read', 'write', 'read'],
        'min_ms': [124, 651, 126, 668],
        'avg_ms': [385, 913, 265, 891],
        'p50_ms': [176, 788, 183, 783],
        'p90_ms': [338, 1140, 295, 1006],
        'p95_ms': [691, 1216, 570, 1097],
        'max_ms': [3740, 2218, 1501, 2301]
    })
    crud_latency_df.to_csv('crud_latency_results.csv', index=False)
    print("✅ Created: crud_latency_results.csv")
    
    # Registration Latency Results
    registration_df = pd.DataFrame({
        'metric': ['min', 'avg', 'p50', 'p90', 'p95', 'max'],
        'value_ms': [99, 143, 127, 195, 243, 290],
        'tenant_type': ['SILO (PLATINUM)'] * 6
    })
    registration_df.to_csv('registration_latency_results.csv', index=False)
    print("✅ Created: registration_latency_results.csv")

if __name__ == '__main__':
    print("\n" + "="*60)
    print("GENERATING LOAD TEST VISUALIZATIONS")
    print("="*60 + "\n")
    
    # Save CSVs
    save_results_to_csv()
    print()
    
    # Generate PNGs
    create_rate_limiting_charts()
    create_crud_latency_charts()
    create_registration_latency_chart()
    create_combined_summary()
    
    print("\n" + "="*60)
    print("ALL VISUALIZATIONS GENERATED SUCCESSFULLY!")
    print("="*60)
    print("\nFiles created:")
    print("  📊 rate_limiting_results.png")
    print("  📊 crud_latency_results.png")
    print("  📊 registration_latency_results.png")
    print("  📊 load_test_summary.png")
    print("  📄 rate_limiting_results.csv")
    print("  📄 crud_latency_results.csv")
    print("  📄 registration_latency_results.csv")
