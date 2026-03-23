/**
 * Settings page — configure all daemon parameters.
 * (Completing the save methods and DNS toggle that were cut off)
 */

const Settings = {
    currentSettings: {},

    async render() {
        try {
            this.currentSettings = await api.getSettings();
            const s = this.currentSettings;

            return `
            <div class="page-header">
                <h1><i class="fas fa-cog"></i> Settings</h1>
            </div>

            <!-- ISE Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-server"></i> Cisco ISE Connection</h2>
                <div class="form-grid">
                    <div class="form-group">
                        <label>ISE PAN Hostname</label>
                        <input id="ise_host" value="${s.ise?.ise_host || ''}" placeholder="ise-pan.yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>Username</label>
                        <input id="ise_username" value="${s.ise?.ise_username || ''}" placeholder="admin">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input id="ise_password" type="password" value="" placeholder="Enter password">
                    </div>
                    <div class="form-group">
                        <label>ERS Port</label>
                        <input id="ise_ers_port" type="number" value="${s.ise?.ise_ers_port || 9060}">
                    </div>
                    <div class="form-group">
                        <label>Open API Port</label>
                        <input id="ise_open_api_port" type="number" value="${s.ise?.ise_open_api_port || 443}">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveISE()">
                        <i class="fas fa-save"></i> Save ISE Settings
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="Settings.testISE()">
                        <i class="fas fa-plug"></i> Test Connection
                    </button>
                </div>
            </div>

            <!-- ACME Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-certificate"></i> ACME / DigiCert</h2>
                <div class="form-grid">
                    <div class="form-group" style="grid-column: span 2">
                        <label>ACME Directory URL</label>
                        <input id="acme_directory_url" value="${s.acme?.acme_directory_url || 'https://acme.digicert.com/v2/acme/directory/'}">
                    </div>
                    <div class="form-group">
                        <label>Key ID (KID)</label>
                        <input id="acme_kid" type="password" value="" placeholder="Enter KID">
                    </div>
                    <div class="form-group">
                        <label>HMAC Key</label>
                        <input id="acme_hmac_key" type="password" value="" placeholder="Enter HMAC key">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveACME()">
                        <i class="fas fa-save"></i> Save ACME Settings
                    </button>
                </div>
            </div>

            <!-- Certificate Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-lock"></i> Certificate</h2>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Common Name</label>
                        <input id="common_name" value="${s.certificate?.common_name || ''}" placeholder="guest.yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>SAN Names (comma-separated)</label>
                        <input id="san_names" value="${(s.certificate?.san_names || []).join(',')}" placeholder="guest.yourdomain.com,portal.yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>Key Type</label>
                        <select id="key_type">
                            <option value="RSA_2048" ${s.certificate?.key_type === 'RSA_2048' ? 'selected' : ''}>RSA 2048</option>
                            <option value="RSA_4096" ${s.certificate?.key_type === 'RSA_4096' ? 'selected' : ''}>RSA 4096</option>
                            <option value="ECDSA_256" ${s.certificate?.key_type === 'ECDSA_256' ? 'selected' : ''}>ECDSA 256</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Certificate Mode</label>
                        <select id="certificate_mode">
                            <option value="shared" ${s.certificate?.certificate_mode === 'shared' ? 'selected' : ''}>Shared (one cert for all nodes)</option>
                            <option value="per-node" ${s.certificate?.certificate_mode === 'per-node' ? 'selected' : ''}>Per-Node (independent certs)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Portal Group Tag</label>
                        <input id="portal_group_tag" value="${s.certificate?.portal_group_tag || 'Default Portal Certificate Group'}">
                    </div>
                    <div class="form-group">
                        <label>Renewal Threshold (days before expiry)</label>
                        <input id="renewal_threshold_days" type="number" value="${s.certificate?.renewal_threshold_days || 30}" min="1" max="365">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveCertificate()">
                        <i class="fas fa-save"></i> Save Certificate Settings
                    </button>
                </div>
            </div>

            <!-- DNS Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-globe"></i> DNS Provider</h2>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Provider</label>
                        <select id="dns_provider" onchange="Settings.toggleDNSFields()">
                            <option value="cloudflare" ${s.dns?.dns_provider === 'cloudflare' ? 'selected' : ''}>Cloudflare</option>
                            <option value="aws_route53" ${s.dns?.dns_provider === 'aws_route53' ? 'selected' : ''}>AWS Route53</option>
                            <option value="azure_dns" ${s.dns?.dns_provider === 'azure_dns' ? 'selected' : ''}>Azure DNS</option>
                        </select>
                    </div>
                    <!-- Cloudflare -->
                    <div class="form-group dns-field dns-cloudflare">
                        <label>Cloudflare API Token</label>
                        <input id="cloudflare_api_token" type="password" placeholder="Enter token">
                    </div>
                    <div class="form-group dns-field dns-cloudflare">
                        <label>Cloudflare Zone ID</label>
                        <input id="cloudflare_zone_id" value="${s.dns?.cloudflare_zone_id || ''}">
                    </div>
                    <!-- AWS Route53 -->
                    <div class="form-group dns-field dns-aws_route53" style="display:none">
                        <label>Hosted Zone ID</label>
                        <input id="aws_hosted_zone_id" value="${s.dns?.aws_hosted_zone_id || ''}">
                    </div>
                    <div class="form-group dns-field dns-aws_route53" style="display:none">
                        <label>AWS Region</label>
                        <input id="aws_region" value="${s.dns?.aws_region || 'us-east-1'}">
                    </div>
                    <!-- Azure DNS -->
                    <div class="form-group dns-field dns-azure_dns" style="display:none">
                        <label>Subscription ID</label>
                        <input id="azure_subscription_id" value="${s.dns?.azure_subscription_id || ''}">
                    </div>
                    <div class="form-group dns-field dns-azure_dns" style="display:none">
                        <label>Resource Group</label>
                        <input id="azure_resource_group" value="${s.dns?.azure_resource_group || ''}">
                    </div>
                    <div class="form-group dns-field dns-azure_dns" style="display:none">
                        <label>DNS Zone Name</label>
                        <input id="azure_dns_zone_name" value="${s.dns?.azure_dns_zone_name || ''}">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveDNS()">
                        <i class="fas fa-save"></i> Save DNS Settings
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="Settings.testDNS()">
                        <i class="fas fa-plug"></i> Test Connection
                    </button>
                </div>
            </div>

            <!-- SMTP Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-envelope"></i> Email Notifications</h2>
                <div class="form-grid">
                    <div class="form-group">
                        <label>SMTP Server</label>
                        <input id="smtp_server" value="${s.smtp?.smtp_server || ''}" placeholder="smtp.yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>SMTP Port</label>
                        <input id="smtp_port" type="number" value="${s.smtp?.smtp_port || 587}">
                    </div>
                    <div class="form-group">
                        <label>SMTP Username</label>
                        <input id="smtp_username" value="${s.smtp?.smtp_username || ''}" placeholder="alerts@yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>SMTP Password</label>
                        <input id="smtp_password" type="password" placeholder="Enter password">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label>Alert Recipients (comma-separated)</label>
                        <input id="alert_recipients" value="${(s.smtp?.alert_recipients || []).join(',')}" placeholder="admin@yourdomain.com,noc@yourdomain.com">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveSMTP()">
                        <i class="fas fa-save"></i> Save SMTP Settings
                    </button>
                </div>
            </div>

            <!-- Scheduler Settings -->
            <div class="settings-section">
                <h2><i class="fas fa-clock"></i> Scheduler</h2>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Enable Scheduler</label>
                        <select id="scheduler_enabled">
                            <option value="true" ${s.scheduler?.scheduler_enabled ? 'selected' : ''}>Enabled</option>
                            <option value="false" ${!s.scheduler?.scheduler_enabled ? 'selected' : ''}>Disabled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Run at Hour (0-23)</label>
                        <input id="scheduler_cron_hour" type="number" value="${s.scheduler?.scheduler_cron_hour ?? 2}" min="0" max="23">
                    </div>
                    <div class="form-group">
                        <label>Run at Minute (0-59)</label>
                        <input id="scheduler_cron_minute" type="number" value="${s.scheduler?.scheduler_cron_minute ?? 0}" min="0" max="59">
                    </div>
                    <div class="form-group">
                        <label>Interval (hours)</label>
                        <input id="scheduler_interval_hours" type="number" value="${s.scheduler?.scheduler_interval_hours || 24}" min="1" max="168">
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="Settings.saveScheduler()">
                        <i class="fas fa-save"></i> Save Scheduler Settings
                    </button>
                </div>
            </div>

            <!-- ISE Nodes Management -->
            <div class="settings-section">
                <h2><i class="fas fa-network-wired"></i> ISE Nodes</h2>
                <div id="nodes-list"></div>
                <div class="form-grid" style="margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem">
                    <div class="form-group">
                        <label>Node Hostname (FQDN)</label>
                        <input id="new_node_name" placeholder="ise-psn01.yourdomain.com">
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <select id="new_node_role">
                            <option value="PSN">PSN</option>
                            <option value="PAN">PAN</option>
                            <option value="MnT">MnT</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Primary Node?</label>
                        <select id="new_node_primary">
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                        </select>
                    </div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-success btn-sm" onclick="Settings.addNode()">
                        <i class="fas fa-plus"></i> Add Node
                    </button>
                </div>
            </div>`;
        } catch (err) {
            return `<div class="settings-section" style="border-color:var(--danger)">
                <h2><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i> Error</h2>
                <p>Failed to load settings: ${err.message}</p>
            </div>`;
        }
    },

    afterRender() {
        this.toggleDNSFields();
        this.loadNodes();
    },

    toggleDNSFields() {
        const provider = document.getElementById('dns_provider')?.value;
        document.querySelectorAll('.dns-field').forEach(el => el.style.display = 'none');
        document.querySelectorAll(`.dns-${provider}`).forEach(el => el.style.display = 'flex');
    },

    async loadNodes() {
        try {
            const nodes = await api.getNodes();
            const container = document.getElementById('nodes-list');
            if (!container) return;

            if (nodes.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0">No nodes configured yet.</p>';
                return;
            }

            container.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Hostname</th>
                            <th>Role</th>
                            <th>Primary</th>
                            <th>Status</th>
                            <th>Days Remaining</th>
                            <th>Enabled</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${nodes.map(node => `
                        <tr>
                            <td><strong>${node.name}</strong></td>
                            <td><span class="badge info">${node.role}</span></td>
                            <td>${node.is_primary ? '<span class="badge success">PRIMARY</span>' : '—'}</td>
                            <td><span class="badge ${node.cert_status === 'ok' ? 'success' : node.cert_status === 'expiring' ? 'warning' : 'neutral'}">${node.cert_status}</span></td>
                            <td>${node.cert_days_remaining !== null ? node.cert_days_remaining + ' days' : '—'}</td>
                            <td>${node.enabled ? '✅' : '❌'}</td>
                            <td>
                                <button class="btn btn-outline btn-sm" onclick="Settings.toggleNode(${node.id}, ${!node.enabled}, '${node.name}', '${node.role}', ${node.is_primary})">
                                    <i class="fas fa-${node.enabled ? 'pause' : 'play'}"></i>
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="Settings.deleteNode(${node.id}, '${node.name}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        } catch (err) {
            Toast.error('Failed to load nodes: ' + err.message);
        }
    },

    // ── Save Methods ──

    async saveISE() {
        try {
            const data = {
                ise_host: document.getElementById('ise_host').value,
                ise_username: document.getElementById('ise_username').value,
                ise_password: document.getElementById('ise_password').value,
                ise_ers_port: parseInt(document.getElementById('ise_ers_port').value),
                ise_open_api_port: parseInt(document.getElementById('ise_open_api_port').value),
            };
            if (!data.ise_password) delete data.ise_password;
            await api.updateISE(data);
            Toast.success('ISE settings saved');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    async saveACME() {
        try {
            const data = {
                acme_directory_url: document.getElementById('acme_directory_url').value,
                acme_kid: document.getElementById('acme_kid').value,
                acme_hmac_key: document.getElementById('acme_hmac_key').value,
            };
            if (!data.acme_kid) delete data.acme_kid;
            if (!data.acme_hmac_key) delete data.acme_hmac_key;
            await api.updateACME(data);
            Toast.success('ACME settings saved');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    async saveCertificate() {
        try {
            const sanInput = document.getElementById('san_names').value;
            const data = {
                common_name: document.getElementById('common_name').value,
                san_names: sanInput ? sanInput.split(',').map(s => s.trim()).filter(Boolean) : [],
                key_type: document.getElementById('key_type').value,
                certificate_mode: document.getElementById('certificate_mode').value,
                portal_group_tag: document.getElementById('portal_group_tag').value,
                renewal_threshold_days: parseInt(document.getElementById('renewal_threshold_days').value),
            };
            await api.updateCertificate(data);
            Toast.success('Certificate settings saved');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    async saveDNS() {
        try {
            const data = {
                dns_provider: document.getElementById('dns_provider').value,
                cloudflare_api_token: document.getElementById('cloudflare_api_token')?.value || null,
                cloudflare_zone_id: document.getElementById('cloudflare_zone_id')?.value || null,
                aws_hosted_zone_id: document.getElementById('aws_hosted_zone_id')?.value || null,
                aws_region: document.getElementById('aws_region')?.value || null,
                azure_subscription_id: document.getElementById('azure_subscription_id')?.value || null,
                azure_resource_group: document.getElementById('azure_resource_group')?.value || null,
                azure_dns_zone_name: document.getElementById('azure_dns_zone_name')?.value || null,
            };
            // Remove empty secrets
            if (!data.cloudflare_api_token) delete data.cloudflare_api_token;
            await api.updateDNS(data);
            Toast.success('DNS settings saved');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    async saveSMTP() {
        try {
            const recipientsInput = document.getElementById('alert_recipients').value;
            const data = {
                smtp_server: document.getElementById('smtp_server').value || null,
                smtp_port: parseInt(document.getElementById('smtp_port').value),
                smtp_username: document.getElementById('smtp_username').value || null,
                smtp_password: document.getElementById('smtp_password').value || null,
                alert_recipients: recipientsInput ? recipientsInput.split(',').map(s => s.trim()).filter(Boolean) : [],
            };
            if (!data.smtp_password) delete data.smtp_password;
            await api.updateSMTP(data);
            Toast.success('SMTP settings saved');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    async saveScheduler() {
        try {
            const data = {
                scheduler_enabled: document.getElementById('scheduler_enabled').value === 'true',
                scheduler_cron_hour: parseInt(document.getElementById('scheduler_cron_hour').value),
                scheduler_cron_minute: parseInt(document.getElementById('scheduler_cron_minute').value),
                scheduler_interval_hours: parseInt(document.getElementById('scheduler_interval_hours').value),
            };
            await api.updateScheduler(data);
            Toast.success('Scheduler settings saved and applied');
        } catch (err) { Toast.error('Failed to save: ' + err.message); }
    },

    // ── Connection Tests ──

    async testISE() {
        try {
            Toast.info('Testing ISE connection...');
            const result = await api.testISE();
            if (result.success) {
                Toast.success('ISE connection successful!');
            } else {
                Toast.error('ISE connection failed: ' + result.message);
            }
        } catch (err) { Toast.error('Test failed: ' + err.message); }
    },

    async testDNS() {
        try {
            Toast.info('Testing DNS provider connection...');
            const result = await api.testDNS();
            if (result.success) {
                Toast.success('DNS connection successful: ' + result.message);
            } else {
                Toast.error('DNS connection failed: ' + result.message);
            }
        } catch (err) { Toast.error('Test failed: ' + err.message); }
    },

    // ── Node Management ──

    async addNode() {
        try {
            const data = {
                name: document.getElementById('new_node_name').value,
                role: document.getElementById('new_node_role').value,
                enabled: true,
                is_primary: document.getElementById('new_node_primary').value === 'true',
            };
            if (!data.name) {
                Toast.warning('Please enter a node hostname');
                return;
            }
            await api.addNode(data);
            Toast.success(`Node ${data.name} added`);
            document.getElementById('new_node_name').value = '';
            this.loadNodes();
        } catch (err) { Toast.error('Failed to add node: ' + err.message); }
    },

    async toggleNode(id, enabled, name, role, isPrimary) {
        try {
            await api.updateNode(id, { name, role, enabled, is_primary: isPrimary });
            Toast.success(`Node ${name} ${enabled ? 'enabled' : 'disabled'}`);
            this.loadNodes();
        } catch (err) { Toast.error('Failed to update node: ' + err.message); }
    },

    async deleteNode(id, name) {
        if (!confirm(`Delete node ${name}? This cannot be undone.`)) return;
        try {
            await api.deleteNode(id);
            Toast.success(`Node ${name} deleted`);
            this.loadNodes();
        } catch (err) { Toast.error('Failed to delete node: ' + err.message); }
    }
};
