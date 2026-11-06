Tailscale connects Termix to your [Tailscale](https://tailscale.com/) tailnet. Add tailnet devices as hosts in a couple of clicks, and connect to them with Tailscale SSH so no passwords or keys are stored in Termix. It works with [Headscale](https://headscale.net/) too.

Termix's server needs to be on the tailnet to reach those devices.

## List your devices

1. Make an API key in the [Tailscale admin console](https://login.tailscale.com/admin/settings/keys), or with `headscale apikeys create` for Headscale.
2. Install the plugin from the Plugins tab.
3. Open Settings, Tailscale and paste the API key. Select **Headscale** as the Control server when using Headscale, then set API base URL to its server URL (for example, `https://headscale.example` or `https://proxy.example/headscale`). Do not append `/api/v1/node`. Tailscale remains the default.
4. Press Check to see how many devices it can reach.

Open the Tailscale panel from the sidebar to see your devices. Add host adds one as a host, and Copy Tailscale IP copies its `100.x` address. In the host editor, Select Tailscale device fills in a device's address.

The key is stored encrypted. It is only used to list devices. The selected provider determines the endpoint; the plugin does not infer it from a key prefix or fall back to another provider on errors.

Headscale discovery uses its `/api/v1/node` API and maps node IDs, names and IP addresses into the device list. Its explicit `online` flag drives online status; a missing flag is offline, as in the protobuf default. Headscale 0.25.1 does not expose an OS in this response, so that field stays empty. Node keys and pre-authentication keys are not returned to the browser.

The adapter follows the [Headscale 0.25.1 node schema](https://github.com/juanfont/headscale/blob/v0.25.1/proto/headscale/v1/node.proto) and [HTTP service mapping](https://github.com/juanfont/headscale/blob/v0.25.1/proto/headscale/v1/headscale.proto).

## On the dashboard

Add the Tailnet card in the dashboard's edit mode. It shows how many devices are online, using Headscale’s online flag or Tailscale control-server presence and recent activity, and lists them with the online ones first.

## Tailscale SSH

If a host runs [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh), Termix can connect with no credentials at all. Tailscale checks who you are and whether your tailnet's ACL allows it.

1. On the host, turn on Tailscale SSH: `tailscale set --ssh`.
2. In Termix, set the host's Authentication Method to Tailscale.
3. Set the username to a Unix user your tailnet's SSH ACL lets you use. It doesn't have to be root.

If your ACL has `check` mode on, Termix asks you to sign in to Tailscale in the browser before it connects.

## In Host Metrics

With [Host Metrics](/plugins/host-metrics) on, hosts get a Tailscale card: whether Tailscale runs, its IPs, peers and status. Save the host's sudo password to allow changes from the card. Turning Tailscale on or off needs edit access to the host. With only connect access the card is read only.

## Troubleshooting

- Tailscale SSH fails: Check Tailscale runs on the host, SSH is turned on with `tailscale set --ssh`, and your ACL allows the connection from the Termix server's tailnet identity.
- No devices: Check the API key, and the base URL for Headscale.

Who can see the device list is set by `tailscale.devices.view`. Only admins have it at first.
