using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MassifyAdmin;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string assets = WebAssets.Extract();
            if (args.Contains("--self-test"))
            {
                string page = File.ReadAllText(Path.Combine(assets, "index.html"));
                string config = File.ReadAllText(Path.Combine(assets, "supabase-config.js"));
                return page.Contains("delete-client-button", StringComparison.Ordinal) &&
                    page.Contains("extend-client-button", StringComparison.Ordinal) &&
                    config.Contains("https://", StringComparison.Ordinal) ? 0 : 1;
            }
            ApplicationConfiguration.Initialize();
            bool smoke = args.Contains("--webview-test");
            using var window = new AdminWindow(assets, smoke);
            Application.Run(window);
            return !smoke || window.SmokePassed ? 0 : 1;
        }
        catch (Exception)
        {
            if (!args.Contains("--self-test") && !args.Contains("--webview-test"))
                MessageBox.Show("Impossible d’ouvrir l’administration. Vérifiez les droits de votre dossier utilisateur et réessayez.", "Massify-qrcode", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

internal static class WebAssets
{
    public static string Extract()
    {
        using Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("MassifyAdmin.WebAssets.zip")
            ?? throw new InvalidOperationException("Ressources de l’application manquantes.");
        using var buffer = new MemoryStream();
        source.CopyTo(buffer);
        byte[] bytes = buffer.ToArray();
        string hash = Convert.ToHexString(SHA256.HashData(bytes)).Substring(0, 20).ToLowerInvariant();
        string parent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MassifyQRCode", "Admin", "web");
        Directory.CreateDirectory(parent);
        string destination = Path.Combine(parent, hash);
        if (File.Exists(Path.Combine(destination, "index.html")) && File.Exists(Path.Combine(destination, "supabase-config.js"))) return destination;
        if (Directory.Exists(destination)) Directory.Delete(destination, recursive: true);
        string temporary = Path.Combine(parent, "temp-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporary);
        try
        {
            using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string path = Path.GetFullPath(Path.Combine(temporary, entry.FullName));
                string prefix = Path.GetFullPath(temporary) + Path.DirectorySeparatorChar;
                if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Chemin invalide.");
                if (entry.FullName.EndsWith('/')) { Directory.CreateDirectory(path); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                entry.ExtractToFile(path, overwrite: true);
            }
            if (!File.Exists(Path.Combine(temporary, "index.html"))) throw new InvalidDataException("Interface manquante.");
            try { Directory.Move(temporary, destination); }
            catch (IOException) when (Directory.Exists(destination)) { /* Une autre instance a terminé l’extraction. */ }
            return destination;
        }
        finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, recursive: true); }
    }
}

internal sealed class AdminWindow : Form
{
    private const string Host = "appassets.androidplatform.net";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly string assets;
    private readonly bool smoke;
    public bool SmokePassed { get; private set; }
    public AdminWindow(string assetsPath, bool smokeTest = false)
    {
        assets = assetsPath; smoke = smokeTest;
        Text = "Massify-qrcode — Administration";
        Width = 1260; Height = 840; MinimumSize = new Size(360, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9, 10, 22);
        Controls.Add(browser);
        if (smoke)
        {
            var timer = new System.Windows.Forms.Timer { Interval = 45000 };
            timer.Tick += (_, _) => Close();
            FormClosed += (_, _) => { timer.Stop(); timer.Dispose(); };
            timer.Start();
        }
        Shown += async (_, _) => await InitializeBrowser();
    }
    private async Task InitializeBrowser()
    {
        try
        {
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MassifyQRCode", "Admin", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: data);
            await browser.EnsureCoreWebView2Async(environment);
            var core = browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.SetVirtualHostNameToFolderMapping(Host, assets, CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting += (_, e) =>
            {
                if (IsAppUri(e.Uri)) return;
                e.Cancel = true;
                OpenExternal(e.Uri);
            };
            core.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
            core.PermissionRequested += (_, e) =>
            {
                if (e.PermissionKind == CoreWebView2PermissionKind.Camera || e.PermissionKind == CoreWebView2PermissionKind.Microphone || e.PermissionKind == CoreWebView2PermissionKind.Geolocation)
                    e.State = CoreWebView2PermissionState.Deny;
            };
            if (smoke)
            {
                core.NavigationCompleted += async (_, e) =>
                {
                    try
                    {
                        if (e.IsSuccess)
                            SmokePassed = await core.ExecuteScriptAsync("!!(window.supabase && window.QR_CONFIG && window.QR_CONFIG.supabaseUrl.startsWith('https://') && document.getElementById('login-form') && document.getElementById('delete-client-button'))") == "true";
                    }
                    catch (Exception) { SmokePassed = false; }
                    Close();
                };
            }
            core.Navigate("https://" + Host + "/index.html");
        }
        catch (Exception error)
        {
            if (smoke)
                try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "massify-webview-test-error.txt"), error.ToString()); } catch { }
            else
                MessageBox.Show("Impossible de démarrer la vue d’administration. Installez ou mettez à jour Microsoft Edge WebView2 Runtime, puis réessayez.", "Massify-qrcode", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            Close();
        }
    }
    private static bool IsAppUri(string value) => Uri.TryCreate(value, UriKind.Absolute, out Uri? uri) &&
        uri.Scheme == Uri.UriSchemeHttps && uri.Host.Equals(Host, StringComparison.OrdinalIgnoreCase) && uri.IsDefaultPort;
    private static void OpenExternal(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out Uri? uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeMailto && uri.Scheme != "tel")) return;
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
        catch (Exception) { MessageBox.Show("Impossible d’ouvrir ce lien dans votre navigateur.", "Massify-qrcode", MessageBoxButtons.OK, MessageBoxIcon.Information); }
    }
}
