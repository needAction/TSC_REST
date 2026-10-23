using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EscapeGame.Data.Csv;
using EscapeGame.Data.Infrastructure;

internal static class CsvReaderChecks
{
    private sealed class Source : ICsvTextSource
    {
        public int Reads;
        public TaskCompletionSource<string> Pending;
        public Task<string> ReadTextAsync(string sourceName, CancellationToken token)
        {
            Reads++;
            return Pending == null ? Task.FromResult("ColumnA\nvalue") : Pending.Task;
        }
    }
    private static void Check(bool value, string message)
    {
        if (!value)
            throw new Exception(message);
    }
    private static string Encode(string value) => Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length > 0 && args[0] == "checks")
            {
                ExtraChecks().GetAwaiter().GetResult();
                Console.WriteLine("C# loader/file/cancellation/readonly checks passed");
                return 0;
            }
            var text = Encoding.UTF8.GetString(Convert.FromBase64String(Console.In.ReadToEnd()));
            var document = new CsvParser().Read(text, "fixture.csv");
            Console.WriteLine("OK");
            Console.WriteLine(document.Headers.Count);
            foreach (string header in document.Headers)
                Console.WriteLine(Encode(header));
            Console.WriteLine(document.Rows.Count);
            foreach (var row in document.Rows)
            {
                Console.WriteLine(row.SourceLine);
                foreach (string header in document.Headers)
                    Console.WriteLine(Encode(row.Get(header)));
            }
            return 0;
        }
        catch (CsvParseException error)
        {
            Console.WriteLine("ERROR\n" + (int)error.Code + "\n" + error.LineNumber + "\n" + error.FieldNumber);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
    private static async Task ExtraChecks()
    {
        var parser = new CsvParser();
        var document = parser.Read("ColumnA\n\"\"");
        Check(document.Rows[0].TryGet("ColumnA", out var empty) && empty == "", "Empty value lost");
        Check(!document.Rows[0].TryGet("missing", out _), "Missing value not distinguished");
        bool immutable = false;
        try
        {
            ((IList<string>)document.Headers)[0] = "changed";
        }
        catch (NotSupportedException)
        {
            immutable = true;
        }
        Check(immutable, "Headers mutable");
        immutable = false;
        try
        {
            ((IList<CsvRow>)document.Rows).Clear();
        }
        catch (NotSupportedException)
        {
            immutable = true;
        }
        Check(immutable, "Rows mutable");
        var source = new Source();
        var loader = new CsvLoader(source, parser);
        Check((await loader.LoadAsync("memory.csv", CancellationToken.None)).Rows.Count == 1, "Injected source failed");
        using (var cancelled = new CancellationTokenSource())
        {
            cancelled.Cancel();
            bool stopped = false;
            try
            {
                await loader.LoadAsync("cancelled.csv", cancelled.Token);
            }
            catch (OperationCanceledException)
            {
                stopped = true;
            }
            Check(stopped && source.Reads == 1, "Cancelled call read source");
        }
        using (var cancelled = new CancellationTokenSource())
        {
            source.Pending = new TaskCompletionSource<string>();
            var pending = loader.LoadAsync("pending.csv", cancelled.Token);
            cancelled.Cancel();
            source.Pending.SetResult("ColumnA\nvalue");
            bool stopped = false;
            try
            {
                await pending;
            }
            catch (OperationCanceledException)
            {
                stopped = true;
            }
            Check(stopped, "Late source completion ignored cancellation");
        }
        var file = Path.Combine(Path.GetTempPath(), "csv-" + Guid.NewGuid().ToString("N") + " 한글.csv");
        try
        {
            var fileLoader = new CsvLoader(new Utf8CsvFileSource(), parser);
            File.WriteAllText(file, "\uFEFFColumnA\r\n한글", new UTF8Encoding(false));
            Check((await fileLoader.LoadAsync(file, CancellationToken.None)).Rows[0].Get("ColumnA") == "한글", "UTF8 file failed");
            File.WriteAllBytes(file, new byte[] { 0xC3, 0x28 });
            bool rejected = false;
            try
            {
                await fileLoader.LoadAsync(file, CancellationToken.None);
            }
            catch (DecoderFallbackException)
            {
                rejected = true;
            }
            Check(rejected, "Invalid UTF8 accepted");
            File.Delete(file);
            rejected = false;
            try
            {
                await fileLoader.LoadAsync(file, CancellationToken.None);
            }
            catch (FileNotFoundException)
            {
                rejected = true;
            }
            Check(rejected, "Missing file accepted");
        }
        finally
        {
            if (File.Exists(file))
                File.Delete(file);
        }
    }
}
