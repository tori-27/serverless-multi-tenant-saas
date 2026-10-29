#!/usr/bin/env python3
"""
Visualize k6 noisy neighbor test results
Creates charts comparing noisy vs victim tenant performance
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
import sys

def load_and_process_csv(filename):
    """Load CSV and filter relevant metrics"""
    df = pd.read_csv(filename)
    
    # Convert timestamp to datetime
    df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
    
    return df

def extract_tenant(row):
    """Extract tenant from extra_tags column"""
    if pd.isna(row['extra_tags']):
        return 'other'
    tags = row['extra_tags']
    if 'tenant=noisy' in tags:
        return 'noisy'
    elif 'tenant=victim' in tags:
        return 'victim'
    return 'other'

def create_visualizations(df):
    """Create comparison charts"""
    
    # Filter HTTP request duration data
    http_duration = df[df['metric_name'] == 'http_req_duration'].copy()
    http_duration['tenant'] = http_duration.apply(extract_tenant, axis=1)
    
    # Filter for noisy and victim only
    noisy_data = http_duration[http_duration['tenant'] == 'noisy']
    victim_data = http_duration[http_duration['tenant'] == 'victim']
    
    # Create figure with subplots
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Noisy Neighbor Test Results\nBASIC (noisy) vs PLATINUM (victim)', fontsize=14, fontweight='bold')
    
    # 1. Response Time Over Time
    ax1 = axes[0, 0]
    if len(noisy_data) > 0:
        ax1.scatter(noisy_data['datetime'], noisy_data['metric_value'], 
                   alpha=0.3, s=10, c='red', label='BASIC (noisy)')
    if len(victim_data) > 0:
        ax1.scatter(victim_data['datetime'], victim_data['metric_value'], 
                   alpha=0.5, s=20, c='green', label='PLATINUM (victim)')
    ax1.set_xlabel('Time')
    ax1.set_ylabel('Response Time (ms)')
    ax1.set_title('Response Time Over Time')
    ax1.legend()
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
    ax1.tick_params(axis='x', rotation=45)
    ax1.grid(True, alpha=0.3)
    
    # 2. Response Time Distribution (Box Plot)
    ax2 = axes[0, 1]
    data_to_plot = []
    labels = []
    colors = []
    if len(noisy_data) > 0:
        data_to_plot.append(noisy_data['metric_value'].values)
        labels.append(f'BASIC (noisy)\nn={len(noisy_data)}')
        colors.append('red')
    if len(victim_data) > 0:
        data_to_plot.append(victim_data['metric_value'].values)
        labels.append(f'PLATINUM (victim)\nn={len(victim_data)}')
        colors.append('green')
    
    bp = ax2.boxplot(data_to_plot, labels=labels, patch_artist=True)
    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.5)
    ax2.set_ylabel('Response Time (ms)')
    ax2.set_title('Response Time Distribution')
    ax2.grid(True, alpha=0.3)
    
    # 3. Error Rate Comparison
    ax3 = axes[1, 0]
    http_failed = df[df['metric_name'] == 'http_req_failed'].copy()
    http_failed['tenant'] = http_failed.apply(extract_tenant, axis=1)
    
    noisy_errors = http_failed[http_failed['tenant'] == 'noisy']
    victim_errors = http_failed[http_failed['tenant'] == 'victim']
    
    noisy_error_rate = noisy_errors['metric_value'].mean() * 100 if len(noisy_errors) > 0 else 0
    victim_error_rate = victim_errors['metric_value'].mean() * 100 if len(victim_errors) > 0 else 0
    
    bars = ax3.bar(['BASIC\n(noisy)', 'PLATINUM\n(victim)'], 
                   [noisy_error_rate, victim_error_rate],
                   color=['red', 'green'], alpha=0.7)
    ax3.set_ylabel('Error Rate (%)')
    ax3.set_title('Error Rate Comparison')
    ax3.set_ylim(0, max(noisy_error_rate * 1.2, 10))
    
    # Add value labels on bars
    for bar, val in zip(bars, [noisy_error_rate, victim_error_rate]):
        ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{val:.1f}%', ha='center', va='bottom', fontweight='bold')
    ax3.grid(True, alpha=0.3, axis='y')
    
    # 4. Summary Statistics Table
    ax4 = axes[1, 1]
    ax4.axis('off')
    
    # Calculate statistics
    noisy_stats = {
        'Tenant': 'BASIC (noisy)',
        'Requests': len(noisy_data),
        'Avg Latency': f"{noisy_data['metric_value'].mean():.0f} ms" if len(noisy_data) > 0 else 'N/A',
        'P95 Latency': f"{noisy_data['metric_value'].quantile(0.95):.0f} ms" if len(noisy_data) > 0 else 'N/A',
        'Error Rate': f"{noisy_error_rate:.1f}%",
    }
    victim_stats = {
        'Tenant': 'PLATINUM (victim)',
        'Requests': len(victim_data),
        'Avg Latency': f"{victim_data['metric_value'].mean():.0f} ms" if len(victim_data) > 0 else 'N/A',
        'P95 Latency': f"{victim_data['metric_value'].quantile(0.95):.0f} ms" if len(victim_data) > 0 else 'N/A',
        'Error Rate': f"{victim_error_rate:.1f}%",
    }
    
    table_data = [
        ['Metric', 'BASIC (noisy)', 'PLATINUM (victim)'],
        ['Requests', noisy_stats['Requests'], victim_stats['Requests']],
        ['Avg Latency', noisy_stats['Avg Latency'], victim_stats['Avg Latency']],
        ['P95 Latency', noisy_stats['P95 Latency'], victim_stats['P95 Latency']],
        ['Error Rate', noisy_stats['Error Rate'], victim_stats['Error Rate']],
    ]
    
    table = ax4.table(cellText=table_data, loc='center', cellLoc='center',
                      colWidths=[0.3, 0.35, 0.35])
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1.2, 1.8)
    
    # Style header row
    for j in range(3):
        table[(0, j)].set_facecolor('#4472C4')
        table[(0, j)].set_text_props(color='white', fontweight='bold')
    
    # Color the error rate cells
    table[(4, 1)].set_facecolor('#FFCCCC')  # Light red for noisy
    table[(4, 2)].set_facecolor('#CCFFCC')  # Light green for victim
    
    ax4.set_title('Summary Statistics', pad=20)
    
    plt.tight_layout()
    plt.savefig('noisy-neighbor-charts.png', dpi=150, bbox_inches='tight')
    print("✅ Charts saved to: noisy-neighbor-charts.png")
    plt.show()

def main():
    csv_file = 'noisy-neighbor-results.csv'
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    
    print(f"📊 Loading data from {csv_file}...")
    df = load_and_process_csv(csv_file)
    
    print(f"📈 Total records: {len(df)}")
    print(f"📋 Metrics: {df['metric_name'].nunique()}")
    
    create_visualizations(df)

if __name__ == '__main__':
    main()
