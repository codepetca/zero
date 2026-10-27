# Windows0.5.54 preview candidate

Owner requested updating the Windows installer with the bundled-Java fix on
2026-10-27. Preserve the existing unsigned-preview warning and disabled updater.
No signing credentials/account settings, system Java, normal editor profiles or
Mac feed/assets are changed. Existing released versions stay immutable.

## Source and hosted acceptance

- Windows workflow40549637565 (PR219) passed all selected jobs, including measured
  build, exact archive verification, actual installation/bootstrap/reopening,
  private-Java JavaFX window and cached offline rebuild in its disposable account.
- Actual clean build source:0c417cc03a597ec29582189059e9416ed8f55834. It is a
  synthetic PR merge, not the PR head or canonical main.
- Source tree:cacb0c7b07efcdb3bb0c377be03bed664b7b1f34, independently equal to
  canonical maincbcbb51eb316d1ed5a7663086c37acdae8e682af.
- Installer, full package and both hosted test receipts share the same source,
  version0.5.54 and Setup SHA256. Native interactive acceptance remains false.

## Exact immutable candidate

Installer: `Zero-Setup-0.5.54-windows-development.exe`,14719218bytes, SHA256
`10ea389c11572f77fe3aa54a0f1d895f5be5d4d15e630983893c4fb130c263f9`.
Full package (retained locally):7195890bytes, SHA256
`e8ea46dc91ce646028cbcdecfea035151a8332b3c10e12ccf1b29706e05ef205`.

Matching manual `zero-bootstrap.zip`:4363743bytes, SHA256
`2d7e218f49dfc8c7861a51b5725a9ec1f14a73ff2dde358524c3cf39545ab994`.
The ZIP was recovered uniquely by its measured hash/length from the actual
packaged Zero.exe; the full package is embedded byte-exactly in Setup.
The VSIX’s135source files equal the reviewed current extension sources. The
actual app embeds the expected disabled updater configuration.

Publish the EXE alone under `windows-preview-v0.5.54`, and the exact matching ZIP
alone under `windows-manual-v0.5.54`; both retain preview status. Keep the full
package and all QA receipts as local evidence; do not publish an update feed.
Verify authenticated draft bytes and anonymous public bytes before promoting
`release/windows-preview.json`. Do not replace or append to Mac release54.

Detailed verification script, original hosted artifacts/reports and publisher
receipts are retained under ignored `.verification/windows54/` in this task’s
bundled-java worktree. Hosted Windows Server10.0.20348 automation is not physical
Windows10/11, SmartScreen/school-device or interactive Run acceptance.
