; Lets other computers on the school network reach the exam server (private networks only).
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME} Server"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="${PRODUCT_NAME} Server" dir=in action=allow program="$INSTDIR\${PRODUCT_NAME}.exe" enable=yes profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME} Server"'
!macroend
