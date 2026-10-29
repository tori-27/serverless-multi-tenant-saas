#!/usr/bin/env python3
"""
Comprehensive Load Test Results Visualization
Creates separate charts for:
1. Rate Limiting / Noisy Neighbor Test
2. CRUD Latency Metrics (p50, p90, p95, p99)
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from datetime import datetime
import sys
import os

# Style settings
plt.style.use('seaborn-v0_8-whitegrid')
COLORS = {
    'noisy': '#E74C3C',     # Red
    'victim': '#27AE60',    # Green
    'create': '#3498DB',    # Blue
    'read': '#9B59B6',      # Purple
    'primary': '#2C3E50',   # Dark blue
}

def load_csv(filename):
    """Load CSV and process timestamps"""
    df = pd.read_csv(filename)
    df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
    return df

def extract_tenant(row):
    """Extract tenant from extra_tags"""
    if pd.isna(row.get('extra_tags', '')):
        return 'other'
    tags = str(row['extra_tags'])
    if 'tenant=noisy' in tags:
        return 'noisy'
    elif 'tenant=victim' in tags:
        return 'victim'
    return 'other'

def create_rate_limiting_chart(df, output_file='rate-limiting-results.png'):
    """Create Rate Limiting / Noisy Neighbor visualization"""
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('🔒 Rate Limiting Test Results\nNoisy Neighbor Isolation: BASIC vs PLATINUM', 
                 fontsize=16, fontweight='bold', y=1.02)
    
    # Filter HTTP data
    http_duration = df[df['metric_name'] == 'http_req_duration'].copy()
    http_duration['tenant'] = http_duration.apply(extract_tenant, axis=1)
    
    noisy_data = http_duration[http_duration['tenant'] == 'noisy']
    victim_data = http_duration[http_duration['tenant'] == 'victim']
    
    # 1. Response Time Scatter
    ax1 = axes[0, 0]
    if len(noisy_data) > 0:
        ax1.scatter(noisy_data['datetime'], noisy_data['metric_value'], 
                   alpha=0.4, s=15, c=COLORS['noisy'], label='BASIC (noisy)')
    if len(victim_data) > 0:
        ax1.scatter(victim_data['datetime'], victim_data['metric_value'], 
                   alpha=0.6, s=25, c=COLORS['victim'], label='PLATINUM (victim)')
    ax1.set_xlabel('Time')
    ax1.set_ylabel('Response Time (ms)')
    ax1.set_title('Response Time Over Time')
    ax1.legend(loc='upper right')
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
    ax1.tick_params(axis='x', rotation=45)
    
    # 2. Box Plot
    ax2 = axes[0, 1]
    data_to_plot = []
    labels = []
    colors = []
    if len(noisy_data) > 0:
        data_to_plot.append(noisy_data['metric_value'].values)
        labels.append(f'BASIC (noisy)\nn={len(noisy_data)}')
        colors.append(COLORS['noisy'])
    if len(victim_data) > 0:
        data_to_plot.append(victim_data['metric_value'].values)
        labels.append(f'PLATINUM (victim)\nn={len(victim_data)}')
        colors.append(COLORS['victim'])
    
    bp = ax2.boxplot(data_to_plot, labels=labels, patch_artist=True)
    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax2.set_ylabel('Response Time (ms)')
    ax2.set_title('Response Time Distribution')
    
    # 3. Error Rate / Throttling
    ax3 = axes[1, 0]
    http_failed = df[df['metric_name'] == 'http_req_failed'].copy()
    http_failed['tenant'] = http_failed.apply(extract_tenant, axis=1)
    
    noisy_errors = http_failed[http_failed['tenant'] == 'noisy']
    victim_errors = http_failed[http_failed['tenant'] == 'victim']
    
    noisy_error_rate = noisy_errors['metric_value'].mean() * 100 if len(noisy_errors) > 0 else 0
    victim_error_rate = victim_errors['metric_value'].mean() * 100 if len(victim_errors) > 0 else 0
    
    x = np.arange(2)
    bars = ax3.bar(x, [noisy_error_rate, victim_error_rate],
                   color=[COLORS['noisy'], COLORS['victim']], alpha=0.8, width=0.6)
    ax3.set_xticks(x)
    ax3.set_xticklabels(['BASIC\n(noisy)', 'PLATINUM\n(victim)'])
    ax3.set_ylabel('Error Rate (%)')
    ax3.set_title('Throttling Rate (429 Errors)')
    ax3.set_ylim(0, max(noisy_error_rate * 1.3, 10))
    
    for bar, val in zip(bars, [noisy_error_rate, victim_error_rate]):
        ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{val:.1f}%', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    # 4. Summary Table
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    table_data = [
        ['Metric', 'BASIC (noisy)', 'PLATINUM (victim)'],
        ['Requests', f'{len(noisy_data):,}', f'{len(victim_data):,}'],
        ['Avg Latency', f"{noisy_data['metric_value'].mean():.0f} ms" if len(noisy_data) > 0 else 'N/A',
                        f"{victim_data['metric_value'].mean():.0f} ms" if len(victim_data) > 0 else 'N/A'],
        ['P95 Latency', f"{noisy_data['metric_value'].quantile(0.95):.0f} ms" if len(noisy_data) > 0 else 'N/A',
                        f"{victim_data['metric_value'].quantile(0.95):.0f} ms" if len(victim_data) > 0 else 'N/A'],
        ['Error Rate', f'{noisy_error_rate:.1f}%', f'{victim_error_rate:.1f}%'],
        ['Status', '🔴 Throttled', '✅ Isolated'],
    ]
    
    table = ax4.table(cellText=table_data, loc='center', cellLoc='center',
                      colWidths=[0.3, 0.35, 0.35])
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1.2, 1.8)
    
    for j in range(3):
        table[(0, j)].set_facecolor(COLORS['primary'])
        table[(0, j)].set_text_props(color='white', fontweight='bold')
    table[(5, 1)].set_facecolor('#FFCCCC')
    table[(5, 2)].set_facecolor('#CCFFCC')
    
    ax4.set_title('Summary', pad=20, fontweight='bold')
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor='white')
    print(f"✅ Rate Limiting chart saved: {output_file}")
    return fig


def create_latency_chart(df, output_file='latency-results.png'):
    """Create CRUD Latency visualization with percentiles"""
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('⚡ CRUD Operations Latency Analysis\np50, p90, p95, p99 Percentiles', 
                 fontsize=16, fontweight='bold', y=1.02)
    
    # Define metrics to analyze
    metrics = {
        'create_product_latency': ('Create Product', COLORS['create']),
        'get_products_latency': ('Get Products', COLORS['read']),
        'create_order_latency': ('Create Order', '#E67E22'),  # Orange
        'get_orders_latency': ('Get Orders', '#1ABC9C'),      # Teal
    }
    
    # Calculate percentiles for each metric
    percentile_data = {}
    for metric_name, (label, color) in metrics.items():
        metric_df = df[df['metric_name'] == metric_name]
        if len(metric_df) > 0:
            values = metric_df['metric_value']
            percentile_data[label] = {
                'min': values.min(),
                'avg': values.mean(),
                'p50': values.quantile(0.50),
                'p90': values.quantile(0.90),
                'p95': values.quantile(0.95),
                'p99': values.quantile(0.99) if len(values) >= 100 else values.max(),
                'max': values.max(),
                'color': color,
                'values': values
            }
    
    # 1. Percentile Bar Chart
    ax1 = axes[0, 0]
    x = np.arange(len(percentile_data))
    width = 0.15
    
    percentiles = ['p50', 'p90', 'p95']
    for i, pct in enumerate(percentiles):
        values = [percentile_data[op][pct] for op in percentile_data]
        bars = ax1.bar(x + i*width, values, width, label=pct.upper(), alpha=0.8)
    
    ax1.set_xticks(x + width)
    ax1.set_xticklabels(percentile_data.keys(), rotation=15, ha='right')
    ax1.set_ylabel('Latency (ms)')
    ax1.set_title('Latency Percentiles by Operation')
    ax1.legend()
    ax1.grid(True, alpha=0.3, axis='y')
    
    # 2. Box Plot Distribution
    ax2 = axes[0, 1]
    data_to_plot = [percentile_data[op]['values'].values for op in percentile_data]
    labels = list(percentile_data.keys())
    colors_list = [percentile_data[op]['color'] for op in percentile_data]
    
    bp = ax2.boxplot(data_to_plot, labels=labels, patch_artist=True)
    for patch, color in zip(bp['boxes'], colors_list):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax2.set_ylabel('Latency (ms)')
    ax2.set_title('Latency Distribution')
    ax2.tick_params(axis='x', rotation=15)
    
    # 3. Write vs Read Comparison
    ax3 = axes[1, 0]
    write_ops = ['Create Product', 'Create Order']
    read_ops = ['Get Products', 'Get Orders']
    
    write_avg = np.mean([percentile_data[op]['avg'] for op in write_ops if op in percentile_data])
    read_avg = np.mean([percentile_data[op]['avg'] for op in read_ops if op in percentile_data])
    write_p95 = np.mean([percentile_data[op]['p95'] for op in write_ops if op in percentile_data])
    read_p95 = np.mean([percentile_data[op]['p95'] for op in read_ops if op in percentile_data])
    
    x = np.arange(2)
    width = 0.35
    bars1 = ax3.bar(x - width/2, [write_avg, read_avg], width, label='Average', color=COLORS['create'], alpha=0.7)
    bars2 = ax3.bar(x + width/2, [write_p95, read_p95], width, label='P95', color=COLORS['read'], alpha=0.7)
    
    ax3.set_xticks(x)
    ax3.set_xticklabels(['Write Operations\n(Create)', 'Read Operations\n(Get)'])
    ax3.set_ylabel('Latency (ms)')
    ax3.set_title('Write vs Read Performance')
    ax3.legend()
    
    for bars in [bars1, bars2]:
        for bar in bars:
            ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 20, 
                    f'{bar.get_height():.0f}ms', ha='center', va='bottom', fontsize=9)
    
    # 4. Summary Table
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    table_data = [['Operation', 'Min', 'Avg', 'p50', 'p90', 'p95', 'Max']]
    for op, data in percentile_data.items():
        table_data.append([
            op,
            f"{data['min']:.0f}ms",
            f"{data['avg']:.0f}ms",
            f"{data['p50']:.0f}ms",
            f"{data['p90']:.0f}ms",
            f"{data['p95']:.0f}ms",
            f"{data['max']:.0f}ms",
        ])
    
    table = ax4.table(cellText=table_data, loc='center', cellLoc='center',
                      colWidths=[0.22, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13])
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.2, 1.8)
    
    for j in range(7):
        table[(0, j)].set_facecolor(COLORS['primary'])
        table[(0, j)].set_text_props(color='white', fontweight='bold')
    
    ax4.set_title('Detailed Latency Statistics', pad=20, fontweight='bold')
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor='white')
    print(f"✅ Latency chart saved: {output_file}")
    return fig


def main():
    print("=" * 60)
    print("📊 Load Test Results Visualization")
    print("=" * 60)
    
    # Check for files
    rate_limit_file = 'noisy-neighbor-results.csv'
    latency_file = 'crud-latency-results.csv'
    
    if os.path.exists(rate_limit_file):
        print(f"\n📈 Processing Rate Limiting data: {rate_limit_file}")
        df = load_csv(rate_limit_file)
        print(f"   Records: {len(df):,}")
        create_rate_limiting_chart(df)
    else:
        print(f"⚠️  {rate_limit_file} not found")
    
    if os.path.exists(latency_file):
        print(f"\n⚡ Processing Latency data: {latency_file}")
        df = load_csv(latency_file)
        print(f"   Records: {len(df):,}")
        create_latency_chart(df)
    else:
        print(f"⚠️  {latency_file} not found")
    
    print("\n" + "=" * 60)
    print("✅ Visualization complete!")
    print("=" * 60)
    
    plt.show()


if __name__ == '__main__':
    main()
