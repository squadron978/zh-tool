Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them with the values from ProjectInfo.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
##
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the ProjectInfo file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "MyProject" # Default "{{.Name}}"
!define INFO_COMPANYNAME    "Squadron978" # override company
!define INFO_PRODUCTNAME    "Star Citizen 中文化工具" # override product name (installer title)
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "{{.Info.ProductVersion}}"
## !define INFO_COPYRIGHT      "Copyright" # Default "{{.Info.Copyright}}"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## !define REQUEST_EXECUTION_LEVEL "admin"            # Default "admin"  see also https://nsis.sourceforge.io/Docs/Chapter4.html
####
## Include the wails tools
####
!include "wails_tools.nsh"

!ifndef EULA_PATH
!define EULA_PATH "resources\\eula.txt"
!endif

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var SC_PATH
Var SC_EDIT
Var SC_BROWSE

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
#!define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_WELCOMEPAGE_TITLE "歡迎使用 Star Citizen 中文化工具 安裝程式"
!define MUI_WELCOMEPAGE_TEXT "本工具將安裝到 $INSTDIR。請閱讀下一頁的使用條款與免責聲明。安裝程式僅建立安裝路徑與必要權限，語系檔會於程式啟動後由您主動下載與套用。"
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
!insertmacro MUI_PAGE_LICENSE "${EULA_PATH}" # Adds a EULA/Disclaimer page
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
Page custom SelectSCPathPage SelectSCPathPageLeave
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uinstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
!uninstfinalize 'powershell -ExecutionPolicy Bypass -NoProfile -File "..\sign.ps1" -PfxPath "$%SIGN_PFX%" -PfxPassword "$%SIGN_PWD%" -Files "%1"'
!finalize 'powershell -ExecutionPolicy Bypass -NoProfile -File "..\sign.ps1" -PfxPath "$%SIGN_PFX%" -PfxPassword "$%SIGN_PWD%" -Files "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
InstallDir "$PROGRAMFILES64\Squadron978\zh-tool" # Default installing folder ($PROGRAMFILES is Program Files folder).
ShowInstDetails show # This will always show the installation details.

Function .onInit
   !insertmacro wails.checkArchitecture
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    # Include elevated copier utility
    File "..\..\bin\zh-tool-copier.exe"

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    # Create game localization folder & set ACL for Users (Builtin Users SID: S-1-5-32-545)
    StrCpy $0 "$SC_PATH\LIVE\data\Localization\chinese_(traditional)"
    CreateDirectory "$0"
    ExecWait '"$SYSDIR\icacls.exe" "$0" /grant *S-1-5-32-545:(OI)(CI)M /T /C'

    !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd

Function SelectSCPathPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
        Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 20u "Select Star Citizen install folder:"
    Pop $1
    ${NSD_CreateDirRequest} 0 22u 80% 12u "$PROGRAMFILES64\Roberts Space Industries\StarCitizen"
    Pop $SC_EDIT
    ${NSD_CreateBrowseButton} 82% 22u 18% 12u "Browse..."
    Pop $SC_BROWSE
    ${NSD_OnClick} $SC_BROWSE OnBrowseSC
    nsDialogs::Show
FunctionEnd

Function OnBrowseSC
    Push $0
    ${NSD_GetText} $SC_EDIT $SC_PATH
    nsDialogs::SelectFolderDialog "Select Star Citizen install folder" $SC_PATH
    Pop $0
    StrCmp $0 "" done
    ${NSD_SetText} $SC_EDIT $0
    StrCpy $SC_PATH $0
done:
    Pop $0
FunctionEnd

Function SelectSCPathPageLeave
    ${NSD_GetText} $SC_EDIT $SC_PATH
    StrCmp $SC_PATH "" invalid
    IfFileExists "$SC_PATH\Bin64\*.*" ok
    IfFileExists "$SC_PATH\LIVE\*.*" ok
    IfFileExists "$SC_PATH\data.p4k" ok
invalid:
    MessageBox MB_ICONSTOP "Selected folder does not look like a Star Citizen installation. Please choose again."
    Abort
ok:
FunctionEnd
