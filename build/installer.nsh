; Lets other computers on the school network reach the exam server (private networks only).
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="TIMPRIEST EDU Server"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="TIMPRIEST EDU Server" dir=in action=allow program="$INSTDIR\TIMPRIEST EDU.exe" enable=yes profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="TIMPRIEST EDU Server"'
!macroend
