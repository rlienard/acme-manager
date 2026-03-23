/**
 * Dashboard page — shows daemon status and node health.
 */

const Dashboard = {
    refreshInterval: null,

    async render() {
        try {
            const status = await api.getStatus();

            const uptime = status.uptime_since
                ? this.formatUptime(new Date(status.uptime_since))
                : 'N/A';

            const nextRun = status.next_run_at
                ? new Date(status.next_run_at).toLocaleString()
                : 'Not scheduled';

            const lastRun = status.last_run_at
                ? new Date(status.last_run_at).toLocaleString()
                : 'Never';

            return `
            <div class="page-header">
                <h1><i class="fas fa-tachometer-alt"></i> Dashboard</h1>
                <div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="Dashboard.checkNow()">
                        <i class="fas fa-search"></i> Check Now
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="Dashboard.renewNow()">
                        <i class="fas fa-sync-alt"></i> Renew Now
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="Dashboard.forceRenew()">
                        <i class="fas fa-bolt"></i> Force Renew
                    </button>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="card-grid">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Daemon Status</span>
                        <i class="fas fa-server" style="color:var(--primary)"></i>
                    </div>
                    <div class="card-value ${status.state === 'idle' ? 'success' : status.state === 'running' ? 'primary' : 'danger'}">
                        ${status.state.toUpperCase()}
                    </div>
                    <div class="card-subtitle">Uptime: ${uptime}</div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Total Renewals</span>
                        <i class="fas fa-certificate" style="color:var(--primary)"></i>
                    </div>
                    <div class="card-value primary">${status.total_renewals}</div>
                    <div class="card-subtitle">
                        <span style="color:var(--success)">${status.successful_renewals} success</span> /
                        <span style="color:var(--danger)">${status.failed_renewals} failed</span>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Last Run</span>
                        <i class="fas fa-clock" style="color:var(--primary)"></i>
                    </div>
                    <div class="card-value" style="font-size:1.2rem">${lastRun}</div>
                    <div class="card-subtitle">Status: ${status.last_run_status || 'N/A'}</div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Next Scheduled Run</span>
                        <i class="fas fa-calendar-alt" style="color:var(--primary)"></i>
                    </div>
                    <div class="card-value" style="font-size:1.2rem">${nextRun}</div>
                    <div class="card-subtitle">
                        Scheduler: ${status.scheduler_enabled ? '✅ Enabled' : '❌ Disabled'}
                    </div>
                </div>
            </div>

            <!-- Node Status -->
            <h2 style="margin-bottom:1rem"><i class="fas fa-network-wired" style="color:var(--primary)"></i> ISE Nodes</h2>
            <div class="card-grid">
                ${status.nodes.map(node => this.renderNodeCard(node)).join('')}
                ${status.nodes.length === 0 ? '<p style="color:var(--text-muted)">No nodes configured. Go to Settings to add ISE nodes.</p>' : ''}
            </div>

            ${status.last_error ? `
            <div class="settings-section" style="border-color:var(--danger);margin-top:2rem">
                <h2><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i> Last Error</h2>
                <pre style="color:var(--danger);font-size:0.85rem;white-space:pre-wrap">${status.last_error}</pre>
            </div>` : ''}`;
        } catch (err) {
            return `<div class="settings-section" style="border-color:var(--danger)">
                <h2><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i> Connection Error</h2>
                <p>Cannot connect to the ACME daemon. Is it running?</p>
                <p style="color:var(--text-muted);margin-top:0.5rem">${err.message}</p>
            </div>`;
        }
    },

    renderNodeCard(node) {
        const statusClass = node.cert_status || 'unknown';
        const icon = { ok: 'check', expiring: 'exclamation', error: 'times', unknown: 'question' }[statusClass] || 'question';
        const daysText = node.cert_days_remaining !== null ? `${node.cert_days_remaining} days remaining` : 'Unknown';
        const lastCheck = node.last_cert_check ? new Date(node.last_cert_check).toLocaleString() : 'Never';

        return `
        <div class="node-card">
            <div class="node-icon ${statusClass}">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="node-info">
                <div class="node-name">
                    ${node.name}
                    ${node.is_primary ? '<span class="node-badge">PRIMARY</span>' : ''}
                </div>
                <div class="node-detail">${daysText} • Last check: ${lastCheck}</div>
            </div>
            <span class="badge ${statusClass === 'ok' ? 'success' : statusClass === 'expiring' ? 'warning' : statusClass === 'error' ? 'danger' : 'neutral'}">
                ${(statusClass).toUpperCase()}
            </span>
        </div>`;
    },

    formatUptime(since) {
        const diff = Date.now() - since.getTime();
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    },

    async checkNow() {
        try {
            Toast.info('Running certificate check...');
            await api.triggerAction('check');
            Toast.success('Certificate check completed');
            setTimeout(() => App.navigate('dashboard'), 2000);
        } catch (err) { Toast.error(err.message); }
    },

    async renewNow() {
        try {
            Toast.info('Triggering renewal...');
            await api.triggerAction('renew');
            Toast.success('Renewal triggered in background');
        } catch (err) { Toast.error(err.message); }
    },

    async forceRenew() {
        if (!confirm('Force renew all certificates regardless of expiry?')) return;
        try {
            Toast.warning('Force renewal triggered...');
            await api.triggerAction('force-renew');
            Toast.success('Force renewal running in background');
        } catch (err) { Toast.error(err.message); }
    }
};
